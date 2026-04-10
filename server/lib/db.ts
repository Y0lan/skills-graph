import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { seedCatalog } from './seed-catalog.js'
import { safeJsonParse } from './types.js'

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
          const ratings: Record<string, number> = safeJsonParse(ev.ratings, {}, 'evaluations.ratings')
          for (const [skillId, level] of Object.entries(ratings)) {
            if (level > 0) {
              insert.run(ev.slug, skillId, level, ev.submitted_at)
            }
          }
        }
      })
      seedHistory()
    }
  }

  // Predefined roles for recruitment
  db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS role_categories (
      role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      PRIMARY KEY (role_id, category_id)
    );
  `)

  // Candidates table (recruitment feature)
  db.exec(`
    CREATE TABLE IF NOT EXISTS candidates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT '',
      role_id TEXT REFERENCES roles(id),
      email TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT DEFAULT (datetime('now', '+30 days')),
      ratings TEXT NOT NULL DEFAULT '{}',
      experience TEXT NOT NULL DEFAULT '{}',
      skipped_categories TEXT NOT NULL DEFAULT '[]',
      submitted_at TEXT,
      ai_report TEXT,
      notes TEXT,
      cv_text TEXT,
      ai_suggestions TEXT
    )
  `)

  // Idempotent column additions for existing candidates tables
  for (const col of ['role_id TEXT', 'cv_text TEXT', 'ai_suggestions TEXT']) {
    try { db.exec(`ALTER TABLE candidates ADD COLUMN ${col}`) } catch { /* already exists */ }
  }

  // Add telephone and pays columns to candidates (for Drupal intake)
  // Candidate contact fields for Drupal intake
  for (const col of ['telephone TEXT', 'pays TEXT', 'linkedin_url TEXT', 'github_url TEXT', 'canal TEXT', 'origine TEXT']) {
    try { db.exec(`ALTER TABLE candidates ADD COLUMN ${col}`) } catch { /* already exists */ }
  }

  // ─── Recruitment postes ──────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS postes (
      id TEXT PRIMARY KEY,
      role_id TEXT NOT NULL REFERENCES roles(id),
      titre TEXT NOT NULL,
      pole TEXT NOT NULL CHECK(pole IN ('legacy', 'java_modernisation', 'fonctionnel')),
      headcount INTEGER NOT NULL DEFAULT 1,
      headcount_flexible INTEGER NOT NULL DEFAULT 0,
      experience_min INTEGER NOT NULL DEFAULT 0,
      cigref TEXT NOT NULL DEFAULT '',
      contrat TEXT NOT NULL DEFAULT 'CDIC',
      statut TEXT NOT NULL DEFAULT 'ouvert' CHECK(statut IN ('ouvert', 'pourvu', 'ferme')),
      date_publication TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS candidatures (
      id TEXT PRIMARY KEY,
      candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
      poste_id TEXT NOT NULL REFERENCES postes(id),
      statut TEXT NOT NULL DEFAULT 'postule'
        CHECK(statut IN ('postule','preselectionne','skill_radar_envoye','skill_radar_complete','entretien_1','aboro','entretien_2','proposition','embauche','refuse')),
      canal TEXT NOT NULL DEFAULT 'site'
        CHECK(canal IN ('cabinet','site','candidature_directe','reseau')),
      notes_directeur TEXT,
      taux_compatibilite_poste REAL,
      taux_compatibilite_equipe REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(candidate_id, poste_id)
    );

    CREATE TABLE IF NOT EXISTS candidature_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      candidature_id TEXT NOT NULL REFERENCES candidatures(id) ON DELETE CASCADE,
      type TEXT NOT NULL DEFAULT 'status_change'
        CHECK(type IN ('status_change','note','entretien','document','email')),
      statut_from TEXT,
      statut_to TEXT,
      notes TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS candidature_documents (
      id TEXT PRIMARY KEY,
      candidature_id TEXT NOT NULL REFERENCES candidatures(id) ON DELETE CASCADE,
      type TEXT NOT NULL DEFAULT 'other'
        CHECK(type IN ('aboro', 'cv', 'lettre', 'other')),
      filename TEXT NOT NULL,
      path TEXT NOT NULL,
      uploaded_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS aboro_profiles (
      id TEXT PRIMARY KEY,
      candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
      profile_json TEXT NOT NULL,
      source_document_id TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
  db.exec('CREATE INDEX IF NOT EXISTS idx_aboro_profiles_candidate ON aboro_profiles(candidate_id)')

  // Idempotent: widen candidature_documents CHECK constraint
  // SQLite can't ALTER CHECK, so recreate table without restrictive CHECK
  const hasRestrictiveCheck = (() => {
    const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='candidature_documents'").get() as { sql: string } | undefined
    return tableInfo?.sql?.includes("CHECK(type IN ('aboro', 'cv', 'lettre', 'other'))") ?? false
  })()

  if (hasRestrictiveCheck) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS candidature_documents_new (
        id TEXT PRIMARY KEY,
        candidature_id TEXT NOT NULL REFERENCES candidatures(id) ON DELETE CASCADE,
        type TEXT NOT NULL DEFAULT 'other',
        filename TEXT NOT NULL,
        path TEXT NOT NULL,
        uploaded_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT OR IGNORE INTO candidature_documents_new SELECT * FROM candidature_documents;
      DROP TABLE candidature_documents;
      ALTER TABLE candidature_documents_new RENAME TO candidature_documents;
    `)
  }

  // Idempotent column additions for soft skill scoring + global score
  try { db.exec('ALTER TABLE candidatures ADD COLUMN taux_soft_skills REAL') } catch { /* already exists */ }
  try { db.exec('ALTER TABLE candidatures ADD COLUMN soft_skill_alerts TEXT') } catch { /* already exists */ }
  try { db.exec('ALTER TABLE candidatures ADD COLUMN taux_global REAL') } catch { /* already exists */ }

  // Scoring weights table (configurable global score formula)
  db.exec(`
    CREATE TABLE IF NOT EXISTS scoring_weights (
      id TEXT PRIMARY KEY,
      weight_poste REAL NOT NULL DEFAULT 0.5,
      weight_equipe REAL NOT NULL DEFAULT 0.2,
      weight_soft REAL NOT NULL DEFAULT 0.3,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `)
  db.exec("INSERT OR IGNORE INTO scoring_weights (id) VALUES ('default')")

  db.exec('CREATE INDEX IF NOT EXISTS idx_candidatures_poste ON candidatures(poste_id, statut)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_candidatures_candidate ON candidatures(candidate_id)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_candidature_events ON candidature_events(candidature_id, created_at)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_candidature_documents ON candidature_documents(candidature_id)')

  // Better Auth tables are created by auth.runMigrations() in index.ts

  // Auto-seed if categories table is empty or catalog version changed
  // NOTE: This MUST run BEFORE role seeding (roles reference categories via FK)
  db.exec('CREATE TABLE IF NOT EXISTS catalog_meta (key TEXT PRIMARY KEY, value TEXT)')
  const CATALOG_VERSION = '5.1.0'
  const currentVersion = (db.prepare("SELECT value FROM catalog_meta WHERE key = 'version'").get() as { value: string } | undefined)?.value
  const count = (db.prepare('SELECT COUNT(*) as cnt FROM categories').get() as { cnt: number }).cnt
  if (count === 0 || currentVersion !== CATALOG_VERSION) {
    seedCatalog(db)
    db.prepare("INSERT OR REPLACE INTO catalog_meta (key, value) VALUES ('version', ?)").run(CATALOG_VERSION)
  }

  // Seed default roles if roles table is empty (AFTER catalog seed — FK dependency)
  const roleCount = (db.prepare('SELECT COUNT(*) as c FROM roles').get() as { c: number }).c
  if (roleCount === 0) {
    const seedRoles: { id: string; label: string; categories: string[] }[] = [
      { id: 'dev-full-stack', label: 'Développeur Full Stack', categories: ['core-engineering', 'backend-integration', 'frontend-ui', 'soft-skills-delivery'] },
      { id: 'devops', label: 'Ingénieur DevOps', categories: ['core-engineering', 'platform-engineering', 'observability-reliability', 'security-compliance'] },
      { id: 'qa-engineer', label: 'QA Engineer', categories: ['qa-test-engineering', 'core-engineering', 'observability-reliability'] },
      { id: 'analyste-fonctionnel', label: 'Analyste Fonctionnel', categories: ['analyse-fonctionnelle', 'domain-knowledge', 'project-management-pmo', 'change-management-training'] },
    ]
    const insertRole = db.prepare('INSERT INTO roles (id, label, created_by) VALUES (?, ?, ?)')
    const insertCat = db.prepare('INSERT INTO role_categories (role_id, category_id) VALUES (?, ?)')
    const seedTransaction = db.transaction(() => {
      for (const role of seedRoles) {
        insertRole.run(role.id, role.label, 'system')
        for (const catId of role.categories) {
          insertCat.run(role.id, catId)
        }
      }
    })
    seedTransaction()
  }

  // Seed recruitment postes if postes table is empty
  const posteCount = (db.prepare('SELECT COUNT(*) as c FROM postes').get() as { c: number }).c
  if (posteCount === 0) {
    const recruitmentRoles: { id: string; label: string; categories: string[] }[] = [
      {
        id: 'tech-lead-adelia',
        label: 'Tech Lead Adélia (RPG)',
        categories: ['domain-knowledge', 'backend-integration', 'soft-skills-delivery', 'core-engineering'],
      },
      {
        id: 'dev-senior-adelia',
        label: 'Dev Senior Adélia (RPG)',
        categories: ['domain-knowledge', 'backend-integration', 'core-engineering'],
      },
      {
        id: 'tech-lead-java',
        label: 'Tech Lead Java / JBoss',
        categories: ['core-engineering', 'backend-integration', 'frontend-ui', 'platform-engineering', 'architecture-governance', 'soft-skills-delivery'],
      },
      {
        id: 'dev-java-fullstack',
        label: 'Dev Java Senior Full Stack',
        categories: ['core-engineering', 'backend-integration', 'frontend-ui', 'platform-engineering', 'architecture-governance'],
      },
      {
        id: 'dev-jboss-senior',
        label: 'Dev JBoss Senior',
        categories: ['core-engineering', 'backend-integration', 'frontend-ui', 'platform-engineering'],
      },
      {
        id: 'architecte-si',
        label: 'Architecte SI Logiciel',
        categories: ['architecture-governance', 'core-engineering', 'backend-integration', 'platform-engineering', 'frontend-ui', 'soft-skills-delivery'],
      },
      {
        id: 'business-analyst',
        label: 'Business Analyst',
        categories: ['analyse-fonctionnelle', 'domain-knowledge', 'project-management-pmo', 'change-management-training', 'soft-skills-delivery', 'design-ux'],
      },
    ]

    const insertRole = db.prepare('INSERT OR IGNORE INTO roles (id, label, created_by) VALUES (?, ?, ?)')
    const insertCat = db.prepare('INSERT OR IGNORE INTO role_categories (role_id, category_id) VALUES (?, ?)')
    const insertPoste = db.prepare(`
      INSERT INTO postes (id, role_id, titre, pole, headcount, headcount_flexible, experience_min, cigref, contrat)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const postes: { id: string; roleId: string; titre: string; pole: string; headcount: number; flexible: boolean; expMin: number; cigref: string }[] = [
      { id: 'poste-1-tech-lead-adelia', roleId: 'tech-lead-adelia', titre: 'Tech Lead Adélia (RPG)', pole: 'legacy', headcount: 1, flexible: true, expMin: 10, cigref: '3.4' },
      { id: 'poste-2-dev-senior-adelia', roleId: 'dev-senior-adelia', titre: 'Dev Senior Adélia (RPG)', pole: 'legacy', headcount: 1, flexible: true, expMin: 7, cigref: '3.4' },
      { id: 'poste-3-tech-lead-java', roleId: 'tech-lead-java', titre: 'Tech Lead Java / JBoss', pole: 'java_modernisation', headcount: 1, flexible: false, expMin: 10, cigref: '3.4' },
      { id: 'poste-4-dev-java-fullstack', roleId: 'dev-java-fullstack', titre: 'Dev Java Senior Full Stack', pole: 'java_modernisation', headcount: 1, flexible: false, expMin: 7, cigref: '3.4' },
      { id: 'poste-5-dev-jboss-senior', roleId: 'dev-jboss-senior', titre: 'Dev JBoss Senior', pole: 'java_modernisation', headcount: 1, flexible: false, expMin: 7, cigref: '3.4' },
      { id: 'poste-6-architecte-si', roleId: 'architecte-si', titre: 'Architecte SI Logiciel', pole: 'java_modernisation', headcount: 1, flexible: false, expMin: 10, cigref: '4.9' },
      { id: 'poste-7-business-analyst', roleId: 'business-analyst', titre: 'Business Analyst', pole: 'fonctionnel', headcount: 1, flexible: false, expMin: 7, cigref: '2.2' },
    ]

    const seedPostes = db.transaction(() => {
      for (const role of recruitmentRoles) {
        insertRole.run(role.id, role.label, 'system')
        for (const catId of role.categories) {
          insertCat.run(role.id, catId)
        }
      }
      for (const p of postes) {
        insertPoste.run(p.id, p.roleId, p.titre, p.pole, p.headcount, p.flexible ? 1 : 0, p.expMin, p.cigref, 'CDIC')
      }
    })
    seedPostes()
  }

  // Idempotent: add legacy-ibmi-adelia category to legacy roles (roles already exist in prod)
  const legacyRoleIds = ['tech-lead-adelia', 'dev-senior-adelia']
  for (const roleId of legacyRoleIds) {
    db.prepare('INSERT OR IGNORE INTO role_categories (role_id, category_id) VALUES (?, ?)').run(roleId, 'legacy-ibmi-adelia')
  }

  // Pole → category mapping table
  db.exec(`CREATE TABLE IF NOT EXISTS pole_categories (
    pole TEXT NOT NULL CHECK(pole IN ('legacy', 'java_modernisation', 'fonctionnel')),
    category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (pole, category_id)
  )`)

  const poleCatCount = (db.prepare('SELECT COUNT(*) as c FROM pole_categories').get() as { c: number }).c
  if (poleCatCount === 0) {
    const poleMapping: Record<string, string[]> = {
      legacy: [
        'legacy-ibmi-adelia', 'core-engineering',
        'architecture-governance', 'soft-skills-delivery', 'domain-knowledge',
      ],
      java_modernisation: [
        'core-engineering', 'backend-integration', 'frontend-ui',
        'platform-engineering', 'observability-reliability', 'security-compliance',
        'ai-engineering', 'qa-test-engineering',
        'architecture-governance', 'soft-skills-delivery', 'domain-knowledge',
      ],
      fonctionnel: [
        'analyse-fonctionnelle', 'project-management-pmo', 'change-management-training',
        'design-ux', 'data-engineering-governance', 'management-leadership',
        'architecture-governance', 'soft-skills-delivery', 'domain-knowledge',
      ],
    }
    const insertPoleCategory = db.prepare('INSERT INTO pole_categories (pole, category_id) VALUES (?, ?)')
    db.transaction(() => {
      for (const [pole, cats] of Object.entries(poleMapping)) {
        for (const catId of cats) insertPoleCategory.run(pole, catId)
      }
    })()
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
      ratings: safeJsonParse(row.ratings, {}, 'evaluations.ratings'),
      experience: safeJsonParse(row.experience, {}, 'evaluations.experience'),
      skippedCategories: safeJsonParse(row.skipped_categories, [] as string[], 'evaluations.skipped_categories'),
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
    ratings: safeJsonParse(row.ratings, {}, 'evaluations.ratings'),
    experience: safeJsonParse(row.experience, {}, 'evaluations.experience'),
    skippedCategories: safeJsonParse(row.skipped_categories, [] as string[], 'evaluations.skipped_categories'),
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

// ─── Roles ────────────────────────────────────────────────────

import type { RoleRow, RoleCategoryRow } from './types.js'

export interface RoleWithCategories {
  id: string
  label: string
  createdBy: string
  createdAt: string
  categoryIds: string[]
}

export function getRoles(): RoleWithCategories[] {
  const roles = db.prepare('SELECT * FROM roles WHERE deleted_at IS NULL ORDER BY label').all() as RoleRow[]
  const allCats = db.prepare('SELECT * FROM role_categories').all() as RoleCategoryRow[]
  const catsByRole = new Map<string, string[]>()
  for (const rc of allCats) {
    const list = catsByRole.get(rc.role_id) ?? []
    list.push(rc.category_id)
    catsByRole.set(rc.role_id, list)
  }
  return roles.map(r => ({
    id: r.id,
    label: r.label,
    createdBy: r.created_by,
    createdAt: r.created_at,
    categoryIds: catsByRole.get(r.id) ?? [],
  }))
}

export function getRole(id: string): RoleWithCategories | null {
  const role = db.prepare('SELECT * FROM roles WHERE id = ? AND deleted_at IS NULL').get(id) as RoleRow | undefined
  if (!role) return null
  const cats = db.prepare('SELECT category_id FROM role_categories WHERE role_id = ?').all(id) as { category_id: string }[]
  return {
    id: role.id,
    label: role.label,
    createdBy: role.created_by,
    createdAt: role.created_at,
    categoryIds: cats.map(c => c.category_id),
  }
}

export function createRole(id: string, label: string, categoryIds: string[], createdBy: string): RoleWithCategories {
  const insertRole = db.prepare('INSERT INTO roles (id, label, created_by) VALUES (?, ?, ?)')
  const insertCat = db.prepare('INSERT INTO role_categories (role_id, category_id) VALUES (?, ?)')
  db.transaction(() => {
    insertRole.run(id, label, createdBy)
    for (const catId of categoryIds) {
      insertCat.run(id, catId)
    }
  })()
  return getRole(id)!
}

export function updateRole(id: string, label: string, categoryIds: string[]): RoleWithCategories | null {
  const existing = db.prepare('SELECT id FROM roles WHERE id = ? AND deleted_at IS NULL').get(id) as { id: string } | undefined
  if (!existing) return null
  db.transaction(() => {
    db.prepare('UPDATE roles SET label = ? WHERE id = ?').run(label, id)
    db.prepare('DELETE FROM role_categories WHERE role_id = ?').run(id)
    const insertCat = db.prepare('INSERT INTO role_categories (role_id, category_id) VALUES (?, ?)')
    for (const catId of categoryIds) {
      insertCat.run(id, catId)
    }
  })()
  return getRole(id)
}

export function softDeleteRole(id: string): boolean {
  const result = db.prepare('UPDATE roles SET deleted_at = datetime(\'now\') WHERE id = ? AND deleted_at IS NULL').run(id)
  return result.changes > 0
}

export function getRoleCategories(roleId: string): string[] {
  const rows = db.prepare('SELECT category_id FROM role_categories WHERE role_id = ?').all(roleId) as { category_id: string }[]
  return rows.map(r => r.category_id)
}
