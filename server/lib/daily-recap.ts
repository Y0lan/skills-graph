/**
 * Daily-recap digest builder + sender.
 *
 * Hit once per day at 08:00 Pacific/Noumea (21:00 UTC) by a k8s CronJob
 * (deployed manifest in the cloud-sinapse-infra repo). For each
 * recruiter (RECRUITMENT_LEADS) it builds a digest covering the next
 * 24h:
 *   - manual reminders due today (candidature_reminders)
 *   - upcoming interviews / aboro tests (candidature_stage_data.scheduled_at)
 *   - proposition deadlines (candidature_stage_data.response_deadline)
 *   - embauche arrivals (candidature_stage_data.arrival_date)
 *
 * The digest goes to all leads even if a specific reminder was created
 * by another lead — the team operates as a shared inbox. If you want
 * per-recruiter scoping, filter `created_by`. Mailer uses Resend and
 * the same FROM_EMAIL as transition mails.
 *
 * Idempotent: running twice on the same day is safe (no DB writes).
 */
import { Resend } from 'resend';
import { getDb } from './db.js';
import { RECRUITMENT_LEADS } from '../middleware/require-lead.js';
import { resolveAppPublicOrigin } from './public-origin.js';
const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = 'Radar SINAPSE <radar@sinapse.nc>';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
interface ReminderRow {
    id: number;
    candidature_id: string;
    candidate_id: string;
    candidate_name: string;
    poste_titre: string;
    remind_at: string;
    body_md: string;
    created_by: string;
}
interface StageEventRow {
    candidature_id: string;
    candidate_name: string;
    poste_titre: string;
    stage: string;
    scheduled_at: string | null;
    response_deadline: string | null;
    arrival_date: string | null;
    data_json: string;
}
interface DigestEntry {
    kind: 'reminder' | 'entretien' | 'aboro' | 'proposition' | 'embauche';
    candidatureId: string;
    candidateName: string;
    posteTitre: string;
    whenStr: string;
    detail: string;
}
/**
 * Convert wall-clock fiche string (YYYY-MM-DDTHH:mm or YYYY-MM-DD) to
 * a UTC instant by treating it as Pacific/Noumea local time. Mirrors
 * the parseFicheDateTime() helper from the frontend (kept local here
 * because server can't import @/ — different tsconfig).
 *
 * Codex P2 fix: date-only fields are anchored at **start-of-day**
 * (00:00 Nouméa) when used in the cron's "next 24h" window. The
 * 08:00 cron runs `now`, and a date-only deadline of "tomorrow"
 * stored as `YYYY-MM-DD` should fire today (J-1) since it's <24h
 * from start-of-tomorrow. Anchoring at noon as we did originally
 * meant the alert was missed until the morning of the deadline.
 */
function noumeaWallClockToUtc(stored: string, opts: {
    dateAnchor?: 'noon' | 'startOfDay';
} = {}): Date | null {
    if (!stored)
        return null;
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(stored)) {
        const seconds = stored.length === 16 ? ':00' : '';
        const d = new Date(`${stored}${seconds}+11:00`);
        return Number.isNaN(d.getTime()) ? null : d;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(stored)) {
        const anchor = opts.dateAnchor === 'startOfDay' ? 'T00:00:00' : 'T12:00:00';
        const d = new Date(`${stored}${anchor}+11:00`);
        return Number.isNaN(d.getTime()) ? null : d;
    }
    return null;
}
function isFutureWithin24h(stored: string | null, now: Date): boolean {
    if (!stored)
        return false;
    const d = noumeaWallClockToUtc(stored);
    if (!d)
        return false;
    const ms = d.getTime() - now.getTime();
    return ms >= 0 && ms <= ONE_DAY_MS;
}
/**
 * Date-only window (codex P2): for proposition deadlines and embauche
 * arrivals, anchor the date at start-of-day Nouméa. The 08:00 cron
 * computes a window from `now` to `now + 24h`. A date-only target
 * "tomorrow" anchored at start-of-day falls 16h ahead → fires today,
 * not tomorrow morning.
 */
function isDateWithinJMinusOne(stored: string | null, now: Date): boolean {
    if (!stored)
        return false;
    const d = noumeaWallClockToUtc(stored, { dateAnchor: 'startOfDay' });
    if (!d)
        return false;
    const ms = d.getTime() - now.getTime();
    // From 12 hours BEFORE start-of-day (still pickable) up to 36 hours
    // AHEAD (catches tomorrow's start-of-day from an early-morning cron).
    return ms >= -12 * 60 * 60 * 1000 && ms <= 36 * 60 * 60 * 1000;
}
function formatNoumea(stored: string): string {
    const d = noumeaWallClockToUtc(stored);
    if (!d)
        return stored;
    return new Intl.DateTimeFormat('fr-FR', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Pacific/Noumea',
    }).format(d);
}
function formatNoumeaDate(stored: string): string {
    const d = noumeaWallClockToUtc(stored);
    if (!d)
        return stored;
    return new Intl.DateTimeFormat('fr-FR', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        timeZone: 'Pacific/Noumea',
    }).format(d);
}
function loadStageData(stored: string): Record<string, unknown> {
    try {
        return JSON.parse(stored) as Record<string, unknown>;
    }
    catch {
        return {};
    }
}
export interface DigestPayload {
    generatedAt: string;
    noumeaDate: string;
    entries: DigestEntry[];
}
/**
 * Build the digest payload (no side effects). Returns `null` when there
 * are no entries — caller short-circuits the email send.
 */
export async function buildDailyRecap(now: Date = new Date()): Promise<DigestPayload | null> {
    const db = getDb();
    const entries: DigestEntry[] = [];
    // 1. Manual reminders due in the next 24h (or already overdue and not done).
    // The remind_at column is a Pacific/Noumea wall-clock string. We convert
    // each row's remind_at to a UTC instant and compare against `now`.
    const reminders = await db.prepare(`
    SELECT r.id, r.candidature_id, r.candidate_id, r.remind_at, r.body_md, r.created_by,
           cand.name AS candidate_name, p.titre AS poste_titre
      FROM candidature_reminders r
      JOIN candidatures c ON c.id = r.candidature_id
      JOIN candidates cand ON cand.id = c.candidate_id
      JOIN postes p ON p.id = c.poste_id
     WHERE r.is_done = 0
  `).all() as ReminderRow[];
    for (const r of reminders) {
        // Codex round-2 P2 fix: include reminders that are due within the
        // next 24h OR are already overdue (any age). Overdue reminders
        // need to keep showing in the digest until the recruiter marks
        // them done — otherwise a missed Friday reminder vanishes Saturday
        // and stays vanished. Future reminders >24h ahead still wait
        // their turn so the digest doesn't fill up with month-out items.
        const targetMs = noumeaWallClockToUtc(r.remind_at)?.getTime();
        if (targetMs == null)
            continue;
        const ms = targetMs - now.getTime();
        const isUpcoming = ms >= 0 && ms <= ONE_DAY_MS;
        const isOverdue = ms < 0; // already past; surfaces every day until done
        if (!isUpcoming && !isOverdue)
            continue;
        entries.push({
            kind: 'reminder',
            candidatureId: r.candidature_id,
            candidateName: r.candidate_name,
            posteTitre: r.poste_titre,
            whenStr: isOverdue
                ? `${formatNoumea(r.remind_at)} (en retard)`
                : formatNoumea(r.remind_at),
            detail: r.body_md ? r.body_md.slice(0, 280) : '— sans détails',
        });
    }
    // 2. Upcoming entretien / aboro / proposition / embauche events from
    //    candidature_stage_data, filtered to current statut so reverted
    //    or stale rows don't fire (codex R4 from v5.1 plan).
    const stageRows = await db.prepare(`
    SELECT sd.candidature_id, sd.stage, sd.scheduled_at, sd.response_deadline, sd.arrival_date, sd.data_json,
           cand.name AS candidate_name, p.titre AS poste_titre
      FROM candidature_stage_data sd
      JOIN candidatures c ON c.id = sd.candidature_id AND c.statut = sd.stage
      JOIN candidates cand ON cand.id = c.candidate_id
      JOIN postes p ON p.id = c.poste_id
  `).all() as StageEventRow[];
    for (const s of stageRows) {
        const d = loadStageData(s.data_json);
        if ((s.stage === 'entretien_1' || s.stage === 'entretien_2') && isFutureWithin24h(s.scheduled_at, now)) {
            const link = (d.meetLink as string | undefined) || (d.location as string | undefined);
            entries.push({
                kind: 'entretien',
                candidatureId: s.candidature_id,
                candidateName: s.candidate_name,
                posteTitre: s.poste_titre,
                whenStr: formatNoumea(s.scheduled_at!),
                detail: link ? `Lien : ${link}` : 'Pas de lien renseigné',
            });
        }
        else if (s.stage === 'aboro' && isFutureWithin24h(s.scheduled_at, now)) {
            entries.push({
                kind: 'aboro',
                candidatureId: s.candidature_id,
                candidateName: s.candidate_name,
                posteTitre: s.poste_titre,
                whenStr: formatNoumea(s.scheduled_at!),
                detail: 'Test Âboro',
            });
        }
        else if (s.stage === 'proposition' && isDateWithinJMinusOne(s.response_deadline, now)) {
            entries.push({
                kind: 'proposition',
                candidatureId: s.candidature_id,
                candidateName: s.candidate_name,
                posteTitre: s.poste_titre,
                whenStr: formatNoumeaDate(s.response_deadline!),
                detail: 'Réponse attendue avant',
            });
        }
        else if (s.stage === 'embauche' && isDateWithinJMinusOne(s.arrival_date, now)) {
            entries.push({
                kind: 'embauche',
                candidatureId: s.candidature_id,
                candidateName: s.candidate_name,
                posteTitre: s.poste_titre,
                whenStr: formatNoumeaDate(s.arrival_date!),
                detail: 'Arrivée en NC',
            });
        }
    }
    if (entries.length === 0)
        return null;
    return {
        generatedAt: now.toISOString(),
        noumeaDate: new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Pacific/Noumea' }).format(now),
        entries,
    };
}
const KIND_ICON: Record<DigestEntry['kind'], string> = {
    reminder: '🔔',
    entretien: '🗓️',
    aboro: '🧠',
    proposition: '📝',
    embauche: '✈️',
};
const KIND_LABEL: Record<DigestEntry['kind'], string> = {
    reminder: 'Rappel',
    entretien: 'Entretien',
    aboro: 'Test Âboro',
    proposition: 'Proposition',
    embauche: 'Embauche',
};
function renderDigestHtml(payload: DigestPayload, baseUrl: string): string {
    const rows = payload.entries.map(e => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eaeaea;font-size:13px;color:#666;white-space:nowrap;">
        ${KIND_ICON[e.kind]} ${KIND_LABEL[e.kind]}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #eaeaea;font-size:14px;">
        <a href="${baseUrl}/recruit/${encodeURIComponent(e.candidatureId)}" style="color:#1B6179;text-decoration:none;font-weight:500;">${escapeHtml(e.candidateName)}</a>
        <span style="color:#888;font-size:12px;"> · ${escapeHtml(e.posteTitre)}</span>
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #eaeaea;font-size:13px;color:#444;">
        <strong>${escapeHtml(e.whenStr)}</strong><br>
        <span style="color:#666;">${escapeHtml(e.detail)}</span>
      </td>
    </tr>
  `).join('');
    return `<!doctype html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fafafa;padding:24px;color:#222;">
<div style="max-width:680px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
  <div style="padding:24px;border-bottom:1px solid #eaeaea;">
    <h1 style="margin:0;font-size:18px;font-weight:600;">Récap recrutement — ${escapeHtml(payload.noumeaDate)}</h1>
    <p style="margin:6px 0 0;font-size:13px;color:#666;">${payload.entries.length} élément${payload.entries.length > 1 ? 's' : ''} dans les prochaines 24h.</p>
  </div>
  <table style="width:100%;border-collapse:collapse;">${rows}</table>
  <div style="padding:16px 24px;font-size:11px;color:#888;background:#fafafa;">
    Généré automatiquement à 08:00 Nouméa par Radar SINAPSE.
  </div>
</div>
</body></html>`;
}
function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
/**
 * Resolve recruiter slugs to email addresses by reading the `users`
 * table. Returns the email of every active recruitment lead.
 */
async function leadEmails(): Promise<string[]> {
    // Defensive: an empty RECRUITMENT_LEADS would produce `IN ()`, which is
    // invalid SQL. Bail out cheaply (coderabbit minor).
    if (RECRUITMENT_LEADS.length === 0)
        return [];
    const db = getDb();
    const rows = await db.prepare(`
    SELECT email FROM "user" WHERE slug IN (${RECRUITMENT_LEADS.map(() => '?').join(',')})
  `).all(...RECRUITMENT_LEADS) as Array<{
        email: string;
    }>;
    return rows.map(r => r.email).filter((e): e is string => typeof e === 'string' && e.includes('@'));
}
export interface SendDailyRecapResult {
    sent: boolean;
    toCount: number;
    entryCount: number;
    reason?: string;
}
/**
 * Build the digest and send it to every recruitment lead. Idempotent
 * across same-day runs (no DB writes). Returns a small status payload
 * the cron endpoint can echo back for monitoring.
 */
export async function sendDailyRecap(opts: {
    baseUrl: string;
    now?: Date;
} = { baseUrl: resolveAppPublicOrigin() }): Promise<SendDailyRecapResult> {
    const now = opts.now ?? new Date();
    const payload = await buildDailyRecap(now);
    if (!payload) {
        return { sent: false, toCount: 0, entryCount: 0, reason: 'no entries in the next 24h' };
    }
    const recipients = await leadEmails();
    if (recipients.length === 0) {
        return { sent: false, toCount: 0, entryCount: payload.entries.length, reason: 'no lead emails resolved' };
    }
    if (!process.env.RESEND_API_KEY) {
        return { sent: false, toCount: recipients.length, entryCount: payload.entries.length, reason: 'RESEND_API_KEY missing' };
    }
    const html = renderDigestHtml(payload, opts.baseUrl);
    const subject = `Récap recrutement — ${payload.noumeaDate} (${payload.entries.length})`;
    const result = await resend.emails.send({
        from: FROM_EMAIL,
        to: recipients,
        subject,
        html,
    });
    if (result.error) {
        return { sent: false, toCount: recipients.length, entryCount: payload.entries.length, reason: `resend: ${result.error.message}` };
    }
    return { sent: true, toCount: recipients.length, entryCount: payload.entries.length };
}
