import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { seedCatalog } from './seed-catalog.js'

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'server', 'data')
export const DB_PATH = path.join(DATA_DIR, 'ratings.db')
const JSON_PATH = path.join(DATA_DIR, 'ratings.json')

export interface MemberEvaluation {
  ratings: Record<string, number>
  experience: Record<string, number>
  skippedCategories: string[]
  submittedAt: string | null
  profileSummary: string | null
}

let db: Database.Database

export function getDb(): Database.Database {
  return db
}

export function initDatabase(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }

  db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS evaluations (
      slug TEXT PRIMARY KEY,
      ratings TEXT NOT NULL DEFAULT '{}',
      experience TEXT NOT NULL DEFAULT '{}',
      skipped_categories TEXT NOT NULL DEFAULT '[]',
      submitted_at TEXT
    )
  `)

  // Add profile_summary column (idempotent migration)
  try {
    db.exec('ALTER TABLE evaluations ADD COLUMN profile_summary TEXT')
  } catch { /* Column already exists */ }

  // Catalog tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      emoji TEXT NOT NULL,
      sort_order INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS calibration_prompts (
      category_id TEXT PRIMARY KEY REFERENCES categories(id),
      text TEXT NOT NULL,
      tools TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      category_id TEXT NOT NULL REFERENCES categories(id),
      label TEXT NOT NULL,
      sort_order INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS skill_descriptors (
      skill_id TEXT NOT NULL REFERENCES skills(id),
      level INTEGER NOT NULL CHECK(level BETWEEN 0 AND 5),
      label TEXT NOT NULL,
      description TEXT NOT NULL,
      PRIMARY KEY (skill_id, level)
    );

    CREATE TABLE IF NOT EXISTS rating_scale (
      value INTEGER PRIMARY KEY CHECK(value BETWEEN 0 AND 5),
      label TEXT NOT NULL,
      short_label TEXT NOT NULL,
      description TEXT NOT NULL
    );
  `)

  // Comparison summaries cache
  db.exec(`
    CREATE TABLE IF NOT EXISTS comparison_summaries (
      slug_a TEXT NOT NULL,
      slug_b TEXT NOT NULL,
      summary TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (slug_a, slug_b)
    )
  `)

  // Chat rate limiting
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_usage (
      user_id TEXT NOT NULL,
      used_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
  db.exec('CREATE INDEX IF NOT EXISTS idx_chat_usage_user ON chat_usage(user_id, used_at)')

  // Skill change history (progression tracking)
  db.exec(`
    CREATE TABLE IF NOT EXISTS skill_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL,
      skill_id TEXT NOT NULL,
      old_level INTEGER NOT NULL CHECK(old_level BETWEEN 0 AND 5),
      new_level INTEGER NOT NULL CHECK(new_level BETWEEN 0 AND 5),
      changed_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
  db.exec('CREATE INDEX IF NOT EXISTS idx_skill_changes_slug ON skill_changes(slug, skill_id, changed_at)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_skill_changes_skill ON skill_changes(skill_id, changed_at)')

  // Seed initial history from existing evaluations (one-time)
  const hasHistory = (db.prepare('SELECT COUNT(*) as c FROM skill_changes').get() as { c: number }).c
  if (hasHistory === 0) {
    const evals = db.prepare('SELECT slug, ratings, submitted_at FROM evaluations WHERE submitted_at IS NOT NULL').all() as {
      slug: string; ratings: string; submitted_at: string
    }[]
    if (evals.length > 0) {
      const insert = db.prepare('INSERT INTO skill_changes (slug, skill_id, old_level, new_level, changed_at) VALUES (?, ?, 0, ?, ?)')
      const seedHistory = db.transaction(() => {
        for (const ev of evals) {
          const ratings: Record<string, number> = JSON.parse(ev.ratings)
          for (const [skillId, level] of Object.entries(ratings)) {
            if (level > 0) {
              insert.run(ev.slug, skillId, level, ev.submitted_at)
            }
          }
        }
      })
      seedHistory()
      console.log(`[DB] Seeded initial skill history from ${evals.length} evaluations`)
    }
  }

  // Candidates table (recruitment feature)
  db.exec(`
    CREATE TABLE IF NOT EXISTS candidates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      email TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT DEFAULT (datetime('now', '+30 days')),
      ratings TEXT NOT NULL DEFAULT '{}',
      experience TEXT NOT NULL DEFAULT '{}',
      skipped_categories TEXT NOT NULL DEFAULT '[]',
      submitted_at TEXT,
      ai_report TEXT,
      notes TEXT
    )
  `)

  // Better Auth tables are created by auth.runMigrations() in index.ts

  // Auto-seed if categories table is empty or catalog version changed
  db.exec('CREATE TABLE IF NOT EXISTS catalog_meta (key TEXT PRIMARY KEY, value TEXT)')
  const CATALOG_VERSION = '3.0.0'
  const currentVersion = (db.prepare("SELECT value FROM catalog_meta WHERE key = 'version'").get() as { value: string } | undefined)?.value
  const count = (db.prepare('SELECT COUNT(*) as cnt FROM categories').get() as { cnt: number }).cnt
  if (count === 0 || currentVersion !== CATALOG_VERSION) {
    seedCatalog(db)
    db.prepare("INSERT OR REPLACE INTO catalog_meta (key, value) VALUES ('version', ?)").run(CATALOG_VERSION)
  }

  // One-time migration from ratings.json
  if (fs.existsSync(JSON_PATH)) {
    try {
      const raw = fs.readFileSync(JSON_PATH, 'utf-8')
      const data: Record<string, MemberEvaluation> = JSON.parse(raw)

      const insert = db.prepare(`
        INSERT OR REPLACE INTO evaluations (slug, ratings, experience, skipped_categories, submitted_at)
        VALUES (?, ?, ?, ?, ?)
      `)

      const migrate = db.transaction(() => {
        for (const [slug, entry] of Object.entries(data)) {
          insert.run(
            slug,
            JSON.stringify(entry.ratings ?? {}),
            JSON.stringify(entry.experience ?? {}),
            JSON.stringify(entry.skippedCategories ?? []),
            entry.submittedAt ?? null,
          )
        }
      })

      migrate()
      fs.renameSync(JSON_PATH, JSON_PATH + '.migrated')
      console.log(`Migrated ${Object.keys(data).length} evaluations from ratings.json to SQLite`)
    } catch (err) {
      console.error('Failed to migrate ratings.json:', err)
    }
  }

  console.log('Database initialized at', DB_PATH)
}

export function getAllEvaluations(): Record<string, MemberEvaluation> {
  const rows = db.prepare('SELECT * FROM evaluations').all() as {
    slug: string
    ratings: string
    experience: string
    skipped_categories: string
    submitted_at: string | null
    profile_summary: string | null
  }[]

  const result: Record<string, MemberEvaluation> = {}
  for (const row of rows) {
    result[row.slug] = {
      ratings: JSON.parse(row.ratings),
      experience: JSON.parse(row.experience),
      skippedCategories: JSON.parse(row.skipped_categories),
      submittedAt: row.submitted_at,
      profileSummary: row.profile_summary ?? null,
    }
  }
  return result
}

export function getEvaluation(slug: string): MemberEvaluation | null {
  const row = db.prepare('SELECT * FROM evaluations WHERE slug = ?').get(slug) as {
    slug: string
    ratings: string
    experience: string
    skipped_categories: string
    submitted_at: string | null
    profile_summary: string | null
  } | undefined

  if (!row) return null

  return {
    ratings: JSON.parse(row.ratings),
    experience: JSON.parse(row.experience),
    skippedCategories: JSON.parse(row.skipped_categories),
    submittedAt: row.submitted_at,
    profileSummary: row.profile_summary ?? null,
  }
}

export function upsertEvaluation(
  slug: string,
  ratings: Record<string, number>,
  experience: Record<string, number>,
  skippedCategories: string[],
): MemberEvaluation {
  db.prepare(`
    INSERT INTO evaluations (slug, ratings, experience, skipped_categories)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET
      ratings = excluded.ratings,
      experience = excluded.experience,
      skipped_categories = excluded.skipped_categories
  `).run(
    slug,
    JSON.stringify(ratings),
    JSON.stringify(experience),
    JSON.stringify(skippedCategories),
  )

  return getEvaluation(slug)!
}

export function submitEvaluation(slug: string): MemberEvaluation | null {
  const now = new Date().toISOString()
  db.prepare('UPDATE evaluations SET submitted_at = ? WHERE slug = ?').run(now, slug)
  return getEvaluation(slug)
}

export function deleteEvaluation(slug: string): void {
  db.prepare('DELETE FROM evaluations WHERE slug = ?').run(slug)
}
