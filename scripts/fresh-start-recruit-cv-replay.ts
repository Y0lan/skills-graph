#!/usr/bin/env tsx
import { pathToFileURL } from 'url';
import fs from 'fs';
import { initDatabase, getDb } from '../server/lib/db.js';
import { readAssetBuffer } from '../server/lib/asset-storage.js';
import { getDocumentForDownload } from '../server/lib/document-service.js';
import { processCvForCandidate } from '../server/lib/cv-pipeline.js';
import { recalculateAllCandidatureScores } from '../server/lib/scoring-helpers.js';

interface ReplayArgs {
  apply: boolean;
  concurrency: 1 | 2;
}

interface RawPdfTarget {
  candidateId: string;
  assetId: string;
  sha256: string;
  alreadyReplayed: boolean;
}

export interface FreshStartReplayResult {
  apply: boolean;
  totalCandidates: number;
  totalCandidatesWithRawPdf: number;
  resetCandidates: number;
  preservedFieldOverrides: number;
  replayedCandidates: number;
  skippedAlreadyReplayed: number;
  failedCandidates: Array<{ candidateId: string; error: string }>;
  rescoredCandidatures: number;
}

type CvProcessor = typeof processCvForCandidate;

function usage(): string {
  return `Usage:
  tsx scripts/fresh-start-recruit-cv-replay.ts [--apply] [--concurrency=1|2]

Dry-run is the default. --apply is required to reset manual candidate answers and replay CV extraction.
Recruiter-locked candidate_field_overrides are preserved and reported.`;
}

export function parseFreshStartReplayArgs(argv: string[]): ReplayArgs {
  let apply = false;
  let concurrency: 1 | 2 = 1;
  for (const arg of argv) {
    if (arg === '--apply') {
      apply = true;
    }
    else if (arg.startsWith('--concurrency=')) {
      const raw = Number(arg.slice('--concurrency='.length));
      if (raw !== 1 && raw !== 2)
        throw new Error(`Invalid concurrency: ${raw}. Use 1 or 2.`);
      concurrency = raw;
    }
    else if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    else {
      throw new Error(`Unknown argument: ${arg}\n${usage()}`);
    }
  }
  return { apply, concurrency };
}

async function replayLedgerExists(): Promise<boolean> {
  const row = await getDb().prepare(`
    SELECT 1 AS ok
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_name = 'ops_cv_replay_runs'
  `).get() as { ok: number } | undefined;
  return !!row;
}

async function loadRawPdfTargets(): Promise<RawPdfTarget[]> {
  const hasLedger = await replayLedgerExists();
  const rows = await getDb().prepare(hasLedger ? `
    SELECT a.id, a.candidate_id, a.sha256, a.created_at,
           r.candidate_id IS NOT NULL AS already_replayed
    FROM candidate_assets a
    LEFT JOIN ops_cv_replay_runs r
      ON r.candidate_id = a.candidate_id
     AND r.raw_pdf_sha256 = a.sha256
    WHERE a.kind = 'raw_pdf'
    ORDER BY a.candidate_id ASC, a.created_at DESC, a.id DESC
  ` : `
    SELECT id, candidate_id, sha256, created_at, false AS already_replayed
    FROM candidate_assets
    WHERE kind = 'raw_pdf'
    ORDER BY candidate_id ASC, created_at DESC, id DESC
  `).all() as Array<{ id: string; candidate_id: string; sha256: string; created_at: string; already_replayed: boolean | number }>;
  const latestByCandidate = new Map<string, RawPdfTarget>();
  for (const row of rows) {
    if (!latestByCandidate.has(row.candidate_id)) {
      latestByCandidate.set(row.candidate_id, {
        candidateId: row.candidate_id,
        assetId: row.id,
        sha256: row.sha256,
        alreadyReplayed: row.already_replayed === true || row.already_replayed === 1,
      });
    }
  }
  return [...latestByCandidate.values()];
}

async function ensureReplayLedger(): Promise<void> {
  await getDb().exec(`
    CREATE TABLE IF NOT EXISTS ops_cv_replay_runs (
      candidate_id TEXT NOT NULL,
      raw_pdf_sha256 TEXT NOT NULL,
      replayed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (candidate_id, raw_pdf_sha256)
    )
  `);
}

async function loadCandidateCount(): Promise<number> {
  const row = await getDb().prepare('SELECT COUNT(*) AS c FROM candidates').get() as { c: number } | undefined;
  return row?.c ?? 0;
}

async function loadFieldOverrideCount(candidateIds: string[]): Promise<number> {
  if (candidateIds.length === 0)
    return 0;
  const table = await getDb().prepare(`
    SELECT 1 AS ok
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_name = 'candidate_field_overrides'
  `).get() as { ok: number } | undefined;
  if (!table)
    return 0;
  const row = await getDb().prepare(`
    SELECT COUNT(*) AS c
    FROM candidate_field_overrides
    WHERE candidate_id = ANY($1::text[])
  `).get(candidateIds) as { c: number } | undefined;
  return row?.c ?? 0;
}

async function readLatestCandidateCvDocumentBuffer(candidateId: string): Promise<Buffer | null> {
  const row = await getDb().prepare(`
    SELECT cd.id
    FROM candidature_documents cd
    JOIN candidatures c ON c.id = cd.candidature_id
    WHERE c.candidate_id = ?
      AND cd.type = 'cv'
      AND cd.deleted_at IS NULL
    ORDER BY cd.created_at DESC, cd.id DESC
    LIMIT 1
  `).get(candidateId) as { id: string } | undefined;
  if (!row)
    return null;
  const fetched = await getDocumentForDownload(row.id);
  if ('error' in fetched)
    return null;
  if (fetched.kind === 'gcs')
    return fetched.buffer;
  try {
    return fs.readFileSync(fetched.filePath);
  }
  catch {
    return null;
  }
}

async function readReplayCvBuffer(target: RawPdfTarget): Promise<Buffer | null> {
  try {
    const assetBuffer = await readAssetBuffer(target.assetId);
    if (assetBuffer)
      return assetBuffer;
  }
  catch { /* fall through to stored CV document fallback */ }
  try {
    return await readLatestCandidateCvDocumentBuffer(target.candidateId);
  }
  catch {
    return null;
  }
}

async function runBounded<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index++];
      await worker(item);
    }
  });
  await Promise.all(workers);
}

export async function freshStartRecruitCvReplay(options: {
  apply?: boolean;
  concurrency?: 1 | 2;
  initialize?: boolean;
  processCv?: CvProcessor;
}): Promise<FreshStartReplayResult> {
  if (options.initialize !== false)
    await initDatabase();
  const db = getDb();
  const targets = await loadRawPdfTargets();
  const totalCandidates = await loadCandidateCount();
  const replayTargets = targets.filter((target) => !target.alreadyReplayed);
  const preservedFieldOverrides = await loadFieldOverrideCount(replayTargets.map((target) => target.candidateId));
  if (!options.apply) {
    return {
      apply: false,
      totalCandidates,
      totalCandidatesWithRawPdf: targets.length,
      resetCandidates: 0,
      preservedFieldOverrides,
      replayedCandidates: 0,
      skippedAlreadyReplayed: targets.length - replayTargets.length,
      failedCandidates: [],
      rescoredCandidatures: 0,
    };
  }
  await ensureReplayLedger();
  let resetCandidates = 0;
  const failedCandidates: Array<{ candidateId: string; error: string }> = [];
  let replayableTargets = replayTargets;
  await db.transaction(async () => {
    const targetIds = replayTargets.map((target) => target.candidateId);
    if (targetIds.length === 0)
      return;
    const runningRows = await db.prepare(`
      SELECT id
      FROM candidates
      WHERE id = ANY($1::text[])
        AND extraction_status = 'running'
    `).all(targetIds) as Array<{ id: string }>;
    const runningIds = new Set(runningRows.map((row) => row.id));
    replayableTargets = replayTargets.filter((target) => !runningIds.has(target.candidateId));
    for (const target of replayTargets) {
      if (runningIds.has(target.candidateId)) {
        failedCandidates.push({ candidateId: target.candidateId, error: 'extraction already running' });
      }
    }
    const replayableIds = replayableTargets.map((target) => target.candidateId);
    if (replayableIds.length === 0)
      return;
    const reset = await db.prepare(`
      UPDATE candidates
      SET ratings = '{}'::jsonb,
          experience = '{}'::jsonb,
          skipped_categories = '[]'::jsonb,
          declined_categories = '[]'::jsonb,
          submitted_at = NULL,
          version = version + 1
      WHERE id = ANY($1::text[])
    `).run(replayableIds);
    resetCandidates = reset.changes;
    for (const target of replayableTargets) {
      await db.prepare(`
        UPDATE candidates
        SET extraction_status = 'idle',
            lock_acquired_at = NULL
        WHERE id = ?
          AND extraction_status <> 'running'
      `).run(target.candidateId);
    }
  })();
  const processCv = options.processCv ?? processCvForCandidate;
  let replayedCandidates = 0;
  await runBounded(replayableTargets, options.concurrency ?? 1, async (target) => {
    const buffer = await readReplayCvBuffer(target);
    if (!buffer) {
      failedCandidates.push({ candidateId: target.candidateId, error: 'raw_pdf asset bytes and latest CV document are not readable' });
      return;
    }
    try {
      const result = await processCv(target.candidateId, buffer, { source: 'reextract' });
      if (result.status === 'skipped' || result.status === 'failed') {
        failedCandidates.push({ candidateId: target.candidateId, error: result.error ?? result.status });
        return;
      }
      await getDb().prepare(`
        INSERT INTO ops_cv_replay_runs (candidate_id, raw_pdf_sha256)
        VALUES (?, ?)
        ON CONFLICT (candidate_id, raw_pdf_sha256) DO NOTHING
      `).run(target.candidateId, target.sha256);
      replayedCandidates++;
    }
    catch (err) {
      failedCandidates.push({ candidateId: target.candidateId, error: err instanceof Error ? err.message : String(err) });
    }
  });
  const rescored = await recalculateAllCandidatureScores('fresh-start-recruit-cv-replay');
  return {
    apply: true,
    totalCandidates,
    totalCandidatesWithRawPdf: targets.length,
    resetCandidates,
    preservedFieldOverrides,
    replayedCandidates,
    skippedAlreadyReplayed: targets.length - replayTargets.length,
    failedCandidates,
    rescoredCandidatures: rescored.scored,
  };
}

async function main() {
  const args = parseFreshStartReplayArgs(process.argv.slice(2));
  const result = await freshStartRecruitCvReplay(args);
  console.log(JSON.stringify(result, null, 2));
  if (!args.apply) {
    console.log('Dry-run only. Re-run with --apply to reset candidate answers and replay CV extraction.');
  }
  await getDb().close().catch(() => undefined);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error('[fresh-start-recruit-cv-replay] failed:', err);
    process.exit(1);
  });
}
