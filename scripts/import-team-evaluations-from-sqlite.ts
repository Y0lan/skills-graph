#!/usr/bin/env tsx
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import Database from 'better-sqlite3';
import { initDatabase, getDb } from '../server/lib/db.js';
import { recalculateAllCandidatureScores } from '../server/lib/scoring-helpers.js';
import { teamMembers } from '../server/data/team-roster.js';

interface ImportArgs {
  sourcePath: string;
  apply: boolean;
  includeUnknownSlugs: boolean;
  pruneNonSource: boolean;
  resetSkillChanges: boolean;
}

interface SourceEvaluation {
  slug: string;
  ratings: string;
  experience: string;
  skippedCategories: string;
  declinedCategories: string;
}

export interface ImportTeamEvaluationsResult {
  apply: boolean;
  sourcePath: string;
  totalSourceRows: number;
  nonEmptyRatings: number;
  knownTeamRows: number;
  unknownSlugs: string[];
  includeUnknownSlugs: boolean;
  importableRows: number;
  skippedUnknownRows: number;
  slugs: string[];
  importedRows: number;
  prunedEvaluationRows: number;
  resetSkillChangeRows: number;
  clearedComparisonRows: number;
  rescoredCandidatures: number;
}

function usage(): string {
  return `Usage:
  SQLITE_PATH=/path/to/restored.db tsx scripts/import-team-evaluations-from-sqlite.ts [--apply] [--include-unknown-slugs] [--prune-non-source] [--reset-skill-changes]
  tsx scripts/import-team-evaluations-from-sqlite.ts --source=/path/to/restored.db [--apply] [--include-unknown-slugs] [--prune-non-source] [--reset-skill-changes]

Dry-run is the default. --apply is required to mutate the app database.
Unknown slugs from the historical SQLite source are reported but skipped by default.
--prune-non-source deletes target evaluations that are not present in the imported source rows.
--reset-skill-changes deletes team skill-up history, useful when the target DB contains pre-cutover test activity.`;
}

export function parseImportTeamEvaluationsArgs(argv: string[]): ImportArgs {
  let sourcePath = process.env.SQLITE_PATH ?? '';
  let apply = false;
  let includeUnknownSlugs = false;
  let pruneNonSource = false;
  let resetSkillChanges = false;
  for (const arg of argv) {
    if (arg === '--apply') {
      apply = true;
    }
    else if (arg === '--include-unknown-slugs') {
      includeUnknownSlugs = true;
    }
    else if (arg === '--prune-non-source') {
      pruneNonSource = true;
    }
    else if (arg === '--reset-skill-changes') {
      resetSkillChanges = true;
    }
    else if (arg.startsWith('--source=')) {
      sourcePath = arg.slice('--source='.length);
    }
    else if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    else {
      throw new Error(`Unknown argument: ${arg}\n${usage()}`);
    }
  }
  if (!sourcePath)
    throw new Error(`Missing SQLite source path.\n${usage()}`);
  return { sourcePath, apply, includeUnknownSlugs, pruneNonSource, resetSkillChanges };
}

function normalizeJson(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string' || raw.trim() === '')
    return fallback;
  try {
    return JSON.stringify(JSON.parse(raw));
  }
  catch (err) {
    throw new Error(`Invalid source JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function hasNonEmptyRatings(rawJson: string): boolean {
  const ratings = JSON.parse(rawJson) as Record<string, unknown>;
  return Object.values(ratings).some((level) => typeof level === 'number' && Number.isFinite(level) && level >= 0);
}

function sourceColumns(sqlite: Database.Database): Set<string> {
  return new Set(sqlite.prepare('PRAGMA table_info(evaluations)').all().map((row) => String((row as { name: string }).name)));
}

function loadSourceEvaluations(sourcePath: string): SourceEvaluation[] {
  if (!fs.existsSync(sourcePath))
    throw new Error(`SQLite source not found: ${sourcePath}`);
  const sqlite = new Database(sourcePath, { readonly: true, fileMustExist: true });
  try {
    const table = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'evaluations'").get();
    if (!table)
      throw new Error('Source SQLite has no evaluations table');
    const cols = sourceColumns(sqlite);
    const skippedExpr = cols.has('skipped_categories') ? 'skipped_categories' : `'[]' AS skipped_categories`;
    const declinedExpr = cols.has('declined_categories') ? 'declined_categories' : `'[]' AS declined_categories`;
    const rows = sqlite.prepare(`
      SELECT slug, ratings, experience, ${skippedExpr}, ${declinedExpr}
      FROM evaluations
      WHERE slug IS NOT NULL AND TRIM(slug) <> ''
      ORDER BY slug ASC
    `).all() as Array<{
      slug: string;
      ratings: unknown;
      experience: unknown;
      skipped_categories: unknown;
      declined_categories: unknown;
    }>;
    return rows.map((row) => ({
      slug: row.slug,
      ratings: normalizeJson(row.ratings, '{}'),
      experience: normalizeJson(row.experience, '{}'),
      skippedCategories: normalizeJson(row.skipped_categories, '[]'),
      declinedCategories: normalizeJson(row.declined_categories, '[]'),
    }));
  }
  finally {
    sqlite.close();
  }
}

export async function importTeamEvaluationsFromSqlite(options: {
  sourcePath: string;
  apply?: boolean;
  includeUnknownSlugs?: boolean;
  pruneNonSource?: boolean;
  resetSkillChanges?: boolean;
  initialize?: boolean;
}): Promise<ImportTeamEvaluationsResult> {
  const sourcePath = path.resolve(options.sourcePath);
  const rows = loadSourceEvaluations(sourcePath);
  const knownSlugs = new Set(teamMembers.map((member) => member.slug));
  const unknownSlugs = [...new Set(rows.map((row) => row.slug).filter((slug) => !knownSlugs.has(slug)))];
  const includeUnknownSlugs = options.includeUnknownSlugs === true;
  const rowsToImport = includeUnknownSlugs ? rows : rows.filter((row) => knownSlugs.has(row.slug));
  const knownTeamRows = rows.filter((row) => knownSlugs.has(row.slug)).length;
  const nonEmptyRatings = rows.filter((row) => hasNonEmptyRatings(row.ratings)).length;
  let initializedTarget = false;
  const ensureTargetDatabase = async () => {
    if (!initializedTarget && options.initialize !== false) {
      await initDatabase();
      initializedTarget = true;
    }
  };
  let prunedEvaluationRows = 0;
  let resetSkillChangeRows = 0;
  let clearedComparisonRows = 0;
  const importSlugs = rowsToImport.map((row) => row.slug);
  if (options.pruneNonSource || options.resetSkillChanges) {
    await ensureTargetDatabase();
    const targetDb = getDb();
    if (options.pruneNonSource) {
      const countSql = importSlugs.length > 0
        ? 'SELECT COUNT(*) AS c FROM evaluations WHERE NOT (slug = ANY($1::text[]))'
        : 'SELECT COUNT(*) AS c FROM evaluations';
      const row = await targetDb.prepare(countSql).get(...(importSlugs.length > 0 ? [importSlugs] : [])) as { c: number } | undefined;
      prunedEvaluationRows = row?.c ?? 0;
    }
    if (options.resetSkillChanges) {
      const row = await targetDb.prepare('SELECT COUNT(*) AS c FROM skill_changes').get() as { c: number } | undefined;
      resetSkillChangeRows = row?.c ?? 0;
    }
    const row = await targetDb.prepare('SELECT COUNT(*) AS c FROM comparison_summaries').get() as { c: number } | undefined;
    clearedComparisonRows = row?.c ?? 0;
  }
  if (!options.apply) {
    return {
      apply: false,
      sourcePath,
      totalSourceRows: rows.length,
      nonEmptyRatings,
      knownTeamRows,
      unknownSlugs,
      includeUnknownSlugs,
      importableRows: rowsToImport.length,
      skippedUnknownRows: rows.length - rowsToImport.length,
      slugs: rows.map((row) => row.slug),
      importedRows: 0,
      prunedEvaluationRows,
      resetSkillChangeRows,
      clearedComparisonRows,
      rescoredCandidatures: 0,
    };
  }
  await ensureTargetDatabase();
  const postgresDb = getDb();
  const upsert = postgresDb.prepare(`
    INSERT INTO evaluations (slug, ratings, experience, skipped_categories, declined_categories, submitted_at, profile_summary)
    VALUES (?, ?, ?, ?, ?, NULL, NULL)
    ON CONFLICT (slug) DO UPDATE SET
      ratings = EXCLUDED.ratings,
      experience = EXCLUDED.experience,
      skipped_categories = EXCLUDED.skipped_categories,
      declined_categories = EXCLUDED.declined_categories,
      submitted_at = NULL,
      profile_summary = NULL
  `);
  const deleteComparisons = postgresDb.prepare('DELETE FROM comparison_summaries WHERE slug_a = ? OR slug_b = ?');
  await postgresDb.transaction(async () => {
    for (const row of rowsToImport) {
      await upsert.run(row.slug, row.ratings, row.experience, row.skippedCategories, row.declinedCategories);
    }
    for (const row of rowsToImport) {
      await deleteComparisons.run(row.slug, row.slug);
    }
    if (options.pruneNonSource) {
      const deleteSql = importSlugs.length > 0
        ? 'DELETE FROM evaluations WHERE NOT (slug = ANY($1::text[]))'
        : 'DELETE FROM evaluations';
      const result = await postgresDb.prepare(deleteSql).run(...(importSlugs.length > 0 ? [importSlugs] : []));
      prunedEvaluationRows = result.changes;
    }
    if (options.resetSkillChanges) {
      const result = await postgresDb.prepare('DELETE FROM skill_changes').run();
      resetSkillChangeRows = result.changes;
    }
    const cleared = await postgresDb.prepare('DELETE FROM comparison_summaries').run();
    clearedComparisonRows = cleared.changes;
  })();
  const rescored = await recalculateAllCandidatureScores('team-evaluations-sqlite-import');
  return {
    apply: true,
    sourcePath,
    totalSourceRows: rows.length,
    nonEmptyRatings,
    knownTeamRows,
    unknownSlugs,
    includeUnknownSlugs,
    importableRows: rowsToImport.length,
    skippedUnknownRows: rows.length - rowsToImport.length,
    slugs: rows.map((row) => row.slug),
    importedRows: rowsToImport.length,
    prunedEvaluationRows,
    resetSkillChangeRows,
    clearedComparisonRows,
    rescoredCandidatures: rescored.scored,
  };
}

async function main() {
  const args = parseImportTeamEvaluationsArgs(process.argv.slice(2));
  try {
    const result = await importTeamEvaluationsFromSqlite(args);
    console.log(JSON.stringify(result, null, 2));
    if (!args.apply) {
      console.log('Dry-run only. Re-run with --apply to import evaluations.');
    }
  }
  finally {
    try {
      await getDb().close().catch(() => undefined);
    }
    catch { /* Database was not initialized, e.g. dry-run source validation only. */ }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error('[import-team-evaluations-from-sqlite] failed:', err);
    process.exit(1);
  });
}
