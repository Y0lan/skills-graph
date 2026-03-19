import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'

/**
 * Create a fresh in-memory SQLite database with all tables initialized.
 * Reads the catalog JSON and seeds it in the test DB.
 */
export function createTestDb() {
  const db = new Database(':memory:')
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // Core tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS evaluations (
      slug TEXT PRIMARY KEY,
      ratings TEXT NOT NULL DEFAULT '{}',
      experience TEXT NOT NULL DEFAULT '{}',
      skipped_categories TEXT NOT NULL DEFAULT '[]',
      submitted_at TEXT,
      profile_summary TEXT
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      emoji TEXT NOT NULL,
      sort_order INTEGER NOT NULL
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

    CREATE TABLE IF NOT EXISTS calibration_prompts (
      category_id TEXT PRIMARY KEY REFERENCES categories(id),
      text TEXT NOT NULL,
      tools TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS comparison_summaries (
      slug_a TEXT NOT NULL,
      slug_b TEXT NOT NULL,
      summary TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (slug_a, slug_b)
    );

    CREATE TABLE IF NOT EXISTS chat_usage (
      user_id TEXT NOT NULL,
      used_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS skill_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL,
      skill_id TEXT NOT NULL,
      old_level INTEGER NOT NULL CHECK(old_level BETWEEN 0 AND 5),
      new_level INTEGER NOT NULL CHECK(new_level BETWEEN 0 AND 5),
      changed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS catalog_meta (key TEXT PRIMARY KEY, value TEXT);
  `)

  // Seed a minimal catalog for tests
  const catalogPath = path.join(process.cwd(), 'skill-catalog-full.json')
  if (fs.existsSync(catalogPath)) {
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'))
    const levelLabels: Record<number, string> = {
      0: 'Inconnu', 1: 'Notions', 2: 'Guidé', 3: 'Autonome', 4: 'Avancé', 5: 'Expert'
    }

    const insertCat = db.prepare('INSERT OR REPLACE INTO categories (id, label, emoji, sort_order) VALUES (?, ?, ?, ?)')
    const insertSkill = db.prepare('INSERT OR REPLACE INTO skills (id, category_id, label, sort_order) VALUES (?, ?, ?, ?)')
    const insertDesc = db.prepare('INSERT OR REPLACE INTO skill_descriptors (skill_id, level, label, description) VALUES (?, ?, ?, ?)')

    for (let ci = 0; ci < catalog.categories.length; ci++) {
      const cat = catalog.categories[ci]
      insertCat.run(cat.id, cat.label, '', ci)
      for (let si = 0; si < cat.skills.length; si++) {
        const skill = cat.skills[si]
        insertSkill.run(skill.id, cat.id, skill.label, si)
        for (const [lvl, desc] of Object.entries(skill.descriptors)) {
          const level = parseInt(lvl, 10)
          insertDesc.run(skill.id, level, levelLabels[level] ?? `Level ${level}`, desc)
        }
      }
    }
  }

  return db
}
