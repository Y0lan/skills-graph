#!/usr/bin/env tsx
import { pathToFileURL } from 'url';
import { initDatabase, getDb } from '../server/lib/db.js';
import { readAssetBuffer } from '../server/lib/asset-storage.js';
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
  replayedCandidates: number;
  skippedAlreadyReplayed: number;
  failedCandidates: Array<{ candidateId: string; error: string }>;
  rescoredCandidatures: number;
}

type CvProcessor = typeof processCvForCandidate;

function usage(): string {
  return `Usage:
  tsx scripts/fresh-start-recruit-cv-replay.ts [--apply] [--concurrency=1|2]

Dry-run is the default. --apply is required to reset manual candidate answers and replay CV extraction.`;
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
  if (!options.apply) {
    return {
      apply: false,
      totalCandidates,
      totalCandidatesWithRawPdf: targets.length,
      resetCandidates: 0,
      replayedCandidates: 0,
      skippedAlreadyReplayed: targets.length - replayTargets.length,
      failedCandidates: [],
      rescoredCandidatures: 0,
    };
  }
  await ensureReplayLedger();
  let resetCandidates = 0;
  await db.transaction(async () => {
    const targetIds = replayTargets.map((target) => target.candidateId);
    if (targetIds.length === 0)
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
    `).run(targetIds);
    resetCandidates = reset.changes;
    for (const target of replayTargets) {
      await db.prepare(`
        UPDATE candidates
        SET extraction_status = 'idle',
            lock_acquired_at = NULL
        WHERE id = ?
      `).run(target.candidateId);
    }
  })();
  const processCv = options.processCv ?? processCvForCandidate;
  const failedCandidates: Array<{ candidateId: string; error: string }> = [];
  let replayedCandidates = 0;
  await runBounded(replayTargets, options.concurrency ?? 1, async (target) => {
    const buffer = await readAssetBuffer(target.assetId);
    if (!buffer) {
      failedCandidates.push({ candidateId: target.candidateId, error: 'raw_pdf asset bytes not readable' });
      return;
    }
    try {
      await processCv(target.candidateId, buffer, { source: 'reextract' });
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
