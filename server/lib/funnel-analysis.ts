import { getDb } from './db.js';
import { STATUT_LABELS } from './constants.js';
export interface FunnelNode {
    id: string;
    label: string;
    count: number;
}
export interface FunnelLink {
    source: string;
    target: string;
    value: number;
    /** Median days spent in `source` before transitioning to `target`. */
    p50_days_in_source?: number;
    /** 90th percentile days spent in `source` before transitioning to `target`. */
    p90_days_in_source?: number;
}
/**
 * Insight surfaced on the funnel page header — points at the slowest stage so
 * the recruiter sees where to push attention.
 */
export interface FunnelInsight {
    type: 'bottleneck' | 'none';
    source?: string;
    target?: string;
    p50_days?: number;
    message?: string;
}
export interface FunnelData {
    nodes: FunnelNode[];
    links: FunnelLink[];
    totals: {
        all: number;
        hired: number;
        refused: number;
        in_progress: number;
    };
    insight?: FunnelInsight;
}
export const STATUS_ORDER = [
    'postule',
    'preselectionne',
    'skill_radar_envoye',
    'skill_radar_complete',
    'entretien_1',
    'aboro',
    'entretien_2',
    'proposition',
    'embauche',
    'refuse',
] as const;
const TERMINAL = new Set(['embauche', 'refuse']);
const STATUS_INDEX: Record<string, number> = Object.fromEntries(STATUS_ORDER.map((s, i) => [s, i]));
function statusOrderIndex(status: string): number {
    return STATUS_INDEX[status] ?? -1;
}
function isForwardTransition(from: string, to: string): boolean {
    return from !== to && statusOrderIndex(to) > statusOrderIndex(from);
}
function validDateOrNull(date: Date): Date | null {
    return Number.isNaN(date.getTime()) ? null : date;
}
function timestampStringToDate(value: string): Date | null {
    const trimmed = value.trim();
    if (!trimmed)
        return null;
    const normalized = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
    const withTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized) ? normalized : `${normalized}Z`;
    return validDateOrNull(new Date(withTimezone));
}
function parseDbTimestamp(value: unknown): Date | null {
    if (value instanceof Date)
        return validDateOrNull(value);
    if (typeof value !== 'string')
        return null;
    return timestampStringToDate(value);
}
function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0)
        return 0;
    const idx = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
    return Math.round(sorted[idx] * 10) / 10;
}
export interface BuildFunnelOpts {
    days?: number | null;
    pole?: string | null;
}
export async function buildFunnel(opts: BuildFunnelOpts = {}): Promise<FunnelData> {
    const { days, pole } = opts;
    const db = getDb();
    const candidatureFilters: string[] = [];
    const candidatureParams: (string | number)[] = [];
    if (typeof days === 'number' && days > 0) {
        candidatureFilters.push("c.created_at >= now() - (?::int * interval '1 day')");
        candidatureParams.push(days);
    }
    if (pole && pole !== 'all') {
        candidatureFilters.push('p.pole = ?');
        candidatureParams.push(pole);
    }
    const whereSql = candidatureFilters.length > 0 ? `WHERE ${candidatureFilters.join(' AND ')}` : '';
    const candidatures = await db.prepare(`
    SELECT c.id, c.statut, c.created_at
    FROM candidatures c
    JOIN postes p ON p.id = c.poste_id
    ${whereSql}
  `).all(...candidatureParams) as {
        id: string;
        statut: string;
        created_at: string;
    }[];
    if (candidatures.length === 0) {
        return {
            nodes: STATUS_ORDER.map(id => ({ id, label: STATUT_LABELS[id] ?? id, count: 0 })),
            links: [],
            totals: { all: 0, hired: 0, refused: 0, in_progress: 0 },
        };
    }
    const candidatureIds = candidatures.map(c => c.id);
    // Aggregate transitions. Use placeholders for the IN clause.
    const placeholders = candidatureIds.map(() => '?').join(',');
    const eventRows = await db.prepare(`
    SELECT statut_from, statut_to, COUNT(DISTINCT candidature_id) as cnt
    FROM candidature_events
    WHERE type = 'status_change'
      AND statut_from IS NOT NULL
      AND statut_to IS NOT NULL
      AND candidature_id IN (${placeholders})
    GROUP BY statut_from, statut_to
  `).all(...candidatureIds) as {
        statut_from: string;
        statut_to: string;
        cnt: number;
    }[];
    // Per-link time-in-source-stage stats. Walked in JS so we can pair each
    // exit event with the matching entry event chronologically per candidature.
    const allEvents = await db.prepare(`
    SELECT candidature_id, statut_from, statut_to, created_at
    FROM candidature_events
    WHERE type = 'status_change'
      AND statut_to IS NOT NULL
      AND candidature_id IN (${placeholders})
    ORDER BY candidature_id, created_at ASC, id ASC
  `).all(...candidatureIds) as {
        candidature_id: string;
        statut_from: string | null;
        statut_to: string;
        created_at: string;
    }[];
    const candidatureCreatedAt = new Map(candidatures.map(c => [c.id, c.created_at]));
    const linkDurationsDays = new Map<string, number[]>();
    let currentCandidate: string | null = null;
    let stageEnteredAt: Date | null = null;
    let currentStage: string | null = null;
    for (const ev of allEvents) {
        if (ev.candidature_id !== currentCandidate) {
            currentCandidate = ev.candidature_id;
            // Each candidature begins in 'postule' at its created_at.
            const createdAt = candidatureCreatedAt.get(currentCandidate);
            stageEnteredAt = parseDbTimestamp(createdAt);
            currentStage = 'postule';
        }
        if (currentStage && stageEnteredAt && ev.statut_from === currentStage) {
            const exitTime = parseDbTimestamp(ev.created_at);
            if (!exitTime) {
                continue;
            }
            const durationDays = Math.max(0, (exitTime.getTime() - stageEnteredAt.getTime()) / (1000 * 60 * 60 * 24));
            const key = `${currentStage}→${ev.statut_to}`;
            const arr = linkDurationsDays.get(key) ?? [];
            arr.push(durationDays);
            linkDurationsDays.set(key, arr);
        }
        // Advance to the new stage.
        currentStage = ev.statut_to;
        stageEnteredAt = parseDbTimestamp(ev.created_at);
    }
    // d3-sankey rejects both self-loops AND cycles. Status reverts (e.g.
    // a recruiter undoing a transition: preselectionne → postule) create
    // backward edges which combined with later forward edges form a
    // cycle and crash the layout. Drop any link where target isn't
    // strictly later in STATUS_ORDER than source. Reverts remain in the
    // event log; they just don't contribute to the funnel viz.
    const links: FunnelLink[] = eventRows
        .filter(r => isForwardTransition(r.statut_from, r.statut_to))
        .map(r => {
        const durations = (linkDurationsDays.get(`${r.statut_from}→${r.statut_to}`) ?? []).slice().sort((a, b) => a - b);
        return {
            source: r.statut_from,
            target: r.statut_to,
            value: r.cnt,
            p50_days_in_source: durations.length > 0 ? percentile(durations, 0.5) : undefined,
            p90_days_in_source: durations.length > 0 ? percentile(durations, 0.9) : undefined,
        };
    });
    // Identify the slowest non-terminal source stage (highest p50) with at least 3 samples.
    let bottleneck: {
        source: string;
        target: string;
        p50: number;
        samples: number;
    } | null = null;
    for (const link of links) {
        const samples = linkDurationsDays.get(`${link.source}→${link.target}`)?.length ?? 0;
        if (samples < 3)
            continue;
        if (link.p50_days_in_source === undefined)
            continue;
        if (TERMINAL.has(link.source))
            continue;
        if (!bottleneck || link.p50_days_in_source > bottleneck.p50) {
            bottleneck = { source: link.source, target: link.target, p50: link.p50_days_in_source, samples };
        }
    }
    const insight: FunnelInsight = bottleneck
        ? {
            type: 'bottleneck',
            source: bottleneck.source,
            target: bottleneck.target,
            p50_days: bottleneck.p50,
            message: `Ralentissement détecté en "${STATUT_LABELS[bottleneck.source] ?? bottleneck.source}" — médiane ${bottleneck.p50}j avant transition vers "${STATUT_LABELS[bottleneck.target] ?? bottleneck.target}" (${bottleneck.samples} candidats).`,
        }
        : { type: 'none' };
    // Compute node counts: candidatures whose CURRENT status is this node, plus candidatures
    // that have ever passed through this node (touched by an event statut_to or statut_from).
    // We use the ever-touched count so the Sankey balance reflects historical flow.
    const everTouchedQuery = await db.prepare(`
    SELECT statut_to as statut, COUNT(DISTINCT candidature_id) as cnt
    FROM candidature_events
    WHERE type = 'status_change'
      AND statut_to IS NOT NULL
      AND candidature_id IN (${placeholders})
    GROUP BY statut_to
  `).all(...candidatureIds) as {
        statut: string;
        cnt: number;
    }[];
    const touchedMap = new Map<string, number>();
    for (const r of everTouchedQuery)
        touchedMap.set(r.statut, r.cnt);
    // Postulé baseline: every candidature was once postulé (initial state).
    touchedMap.set('postule', candidatures.length);
    const nodes: FunnelNode[] = STATUS_ORDER.map(id => ({
        id,
        label: STATUT_LABELS[id] ?? id,
        count: touchedMap.get(id) ?? 0,
    }));
    let hired = 0;
    let refused = 0;
    let in_progress = 0;
    for (const c of candidatures) {
        if (c.statut === 'embauche')
            hired++;
        else if (c.statut === 'refuse')
            refused++;
        else if (!TERMINAL.has(c.statut))
            in_progress++;
    }
    return {
        nodes,
        links,
        totals: { all: candidatures.length, hired, refused, in_progress },
        insight,
    };
}
export interface FunnelFlowCandidate {
    candidature_id: string;
    candidate_id: string;
    full_name: string | null;
    poste_titre: string | null;
    pole: string | null;
    days_in_source: number;
    /** SLA flag derived from P90: > P90 = double-warn, > P50 = warn. */
    sla: 'ok' | 'warn' | 'over';
    /** ISO date the candidate exited the source stage (= entered target). */
    transitioned_at: string;
}
function slaForDuration(durationDays: number, p50: number | null, p90: number | null): FunnelFlowCandidate['sla'] {
    if (p90 !== null && durationDays > p90)
        return 'over';
    if (p50 !== null && durationDays > p50)
        return 'warn';
    return 'ok';
}
function toFlowCandidate(
    match: { candidature_id: string; durationDays: number; transitionedAt: string },
    candidature: {
        candidate_id: string;
        poste_titre: string | null;
        pole: string | null;
        full_name: string | null;
    } | undefined,
    p50: number | null,
    p90: number | null,
): FunnelFlowCandidate {
    return {
        candidature_id: match.candidature_id,
        candidate_id: candidature?.candidate_id ?? '',
        full_name: candidature?.full_name ?? null,
        poste_titre: candidature?.poste_titre ?? null,
        pole: candidature?.pole ?? null,
        days_in_source: match.durationDays,
        sla: slaForDuration(match.durationDays, p50, p90),
        transitioned_at: match.transitionedAt,
    };
}
export interface FunnelFlowData {
    source: string;
    target: string;
    source_label: string;
    target_label: string;
    total: number;
    p50_days: number | null;
    p90_days: number | null;
    candidates: FunnelFlowCandidate[];
}
export interface BuildFunnelFlowOpts extends BuildFunnelOpts {
    source: string;
    target: string;
}
interface FlowCandidatureRow {
    id: string;
    statut: string;
    created_at: string;
    candidate_id: string;
    poste_id: string;
    poste_titre: string | null;
    pole: string | null;
    full_name: string | null;
}
interface StatusEventRow {
    candidature_id: string;
    statut_from: string | null;
    statut_to: string;
    created_at: string;
}
interface FlowMatch {
    candidature_id: string;
    durationDays: number;
    transitionedAt: string;
}
function candidatureFilterSql(days?: number | null, pole?: string | null): {
    whereSql: string;
    params: (string | number)[];
} {
    const filters: string[] = [];
    const params: (string | number)[] = [];
    if (typeof days === 'number' && days > 0) {
        filters.push("c.created_at >= now() - (?::int * interval '1 day')");
        params.push(days);
    }
    if (pole && pole !== 'all') {
        filters.push('p.pole = ?');
        params.push(pole);
    }
    return {
        whereSql: filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '',
        params,
    };
}
async function loadFlowCandidatures(db: ReturnType<typeof getDb>, days?: number | null, pole?: string | null): Promise<FlowCandidatureRow[]> {
    const { whereSql, params } = candidatureFilterSql(days, pole);
    return await db.prepare(`
    SELECT c.id, c.statut, c.created_at, c.candidate_id, c.poste_id,
           p.titre as poste_titre, p.pole as pole,
           ca.name as full_name
    FROM candidatures c
    JOIN postes p ON p.id = c.poste_id
    LEFT JOIN candidates ca ON ca.id = c.candidate_id
    ${whereSql}
  `).all(...params) as FlowCandidatureRow[];
}
async function loadStatusEvents(db: ReturnType<typeof getDb>, candidatureIds: string[]): Promise<StatusEventRow[]> {
    const placeholders = candidatureIds.map(() => '?').join(',');
    return await db.prepare(`
    SELECT candidature_id, statut_from, statut_to, created_at
    FROM candidature_events
    WHERE type = 'status_change'
      AND statut_to IS NOT NULL
      AND candidature_id IN (${placeholders})
    ORDER BY candidature_id, created_at ASC, id ASC
  `).all(...candidatureIds) as StatusEventRow[];
}
function collectFlowMatches(
    events: StatusEventRow[],
    idToCandidature: Map<string, FlowCandidatureRow>,
    source: string,
    target: string,
): FlowMatch[] {
    const matches: FlowMatch[] = [];
    let currentCandidate: string | null = null;
    let stageEnteredAt: Date | null = null;
    let currentStage: string | null = null;
    for (const ev of events) {
        if (ev.candidature_id !== currentCandidate) {
            currentCandidate = ev.candidature_id;
            stageEnteredAt = parseDbTimestamp(idToCandidature.get(currentCandidate)?.created_at);
            currentStage = 'postule';
        }
        const exitTime = parseDbTimestamp(ev.created_at);
        if (currentStage === source && ev.statut_from === source && ev.statut_to === target && stageEnteredAt && exitTime) {
            matches.push({
                candidature_id: ev.candidature_id,
                durationDays: Math.round(Math.max(0, (exitTime.getTime() - stageEnteredAt.getTime()) / (1000 * 60 * 60 * 24)) * 10) / 10,
                transitionedAt: ev.created_at,
            });
        }
        currentStage = ev.statut_to;
        stageEnteredAt = exitTime;
    }
    return matches;
}
function latestCurrentMatches(
    matches: FlowMatch[],
    idToCandidature: Map<string, FlowCandidatureRow>,
    target: string,
): FlowMatch[] {
    const latest = new Map<string, FlowMatch>();
    for (const match of matches) {
        const current = idToCandidature.get(match.candidature_id);
        if (current?.statut !== target)
            continue;
        const previous = latest.get(match.candidature_id);
        if (!previous || new Date(match.transitionedAt).getTime() > new Date(previous.transitionedAt).getTime()) {
            latest.set(match.candidature_id, match);
        }
    }
    return Array.from(latest.values());
}
function emptyFlowData(source: string, target: string): FunnelFlowData {
    return {
        source, target,
        source_label: STATUT_LABELS[source] ?? source,
        target_label: STATUT_LABELS[target] ?? target,
        total: 0, p50_days: null, p90_days: null,
        candidates: [],
    };
}
/**
 * Drill-down for a single Sankey link. Returns the candidates whose CURRENT
 * stage is `target` AND who entered it via a transition from `source`,
 * with each candidate's time spent in `source` before that transition.
 *
 * SLA flag is computed against the link's own P50/P90 (same dataset as the
 * funnel viz), so the panel and the chart stay consistent.
 */
export async function buildFunnelFlow(opts: BuildFunnelFlowOpts): Promise<FunnelFlowData> {
    const { source, target, days, pole } = opts;
    const db = getDb();
    const candidatures = await loadFlowCandidatures(db, days, pole);
    if (candidatures.length === 0) {
        return emptyFlowData(source, target);
    }
    const idToCandidature = new Map(candidatures.map(c => [c.id, c]));
    const candidatureIds = candidatures.map(c => c.id);
    const events = await loadStatusEvents(db, candidatureIds);
    const matches = collectFlowMatches(events, idToCandidature, source, target);
    const currentMatches = latestCurrentMatches(matches, idToCandidature, target);
    const sortedDurations = matches.map(m => m.durationDays).slice().sort((a, b) => a - b);
    const p50 = sortedDurations.length > 0 ? percentile(sortedDurations, 0.5) : null;
    const p90 = sortedDurations.length > 0 ? percentile(sortedDurations, 0.9) : null;
    const candidates = currentMatches
        .map(m => toFlowCandidate(m, idToCandidature.get(m.candidature_id), p50, p90))
        .sort((a, b) => b.days_in_source - a.days_in_source); // slowest first — surfaces problems
    return {
        source, target,
        source_label: STATUT_LABELS[source] ?? source,
        target_label: STATUT_LABELS[target] ?? target,
        total: currentMatches.length,
        p50_days: p50,
        p90_days: p90,
        candidates,
    };
}
