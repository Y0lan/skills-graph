import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { seedCatalog } from './seed-catalog.js'
import { safeJsonParse } from './types.js'
import { buildCanonicalFilename, formatDisplayName } from './file-naming.js'

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'server', 'data')
export const DB_PATH = path.join(DATA_DIR, 'ratings.db')
const JSON_PATH = path.join(DATA_DIR, 'ratings.json')

export interface MemberEvaluation {
  ratings: Record<string, number>
  experience: Record<string, number>
  skippedCategories: string[]
  declinedCategories: string[]
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
        CHECK(type IN ('status_change','note','entretien','document','email','email_sent','email_failed','email_open','email_clicked','email_delivered','email_complained','email_delay','evaluation_reopened','onboarding')),
      statut_from TEXT,
      statut_to TEXT,
      notes TEXT,
      content_md TEXT,
      email_snapshot TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS candidature_documents (
      id TEXT PRIMARY KEY,
      candidature_id TEXT NOT NULL REFERENCES candidatures(id) ON DELETE CASCADE,
      type TEXT NOT NULL DEFAULT 'other'
        CHECK(type IN ('aboro', 'cv', 'lettre', 'entretien', 'proposition', 'administratif', 'other')),
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

  // Idempotent migration: widen candidature_events CHECK constraint + add content_md, email_snapshot columns
  const hasOldEventCheck = (() => {
    const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='candidature_events'").get() as { sql: string } | undefined
    return tableInfo?.sql?.includes("'email')") && !tableInfo?.sql?.includes("'email_sent'")
  })()

  if (hasOldEventCheck) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS candidature_events_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        candidature_id TEXT NOT NULL REFERENCES candidatures(id) ON DELETE CASCADE,
        type TEXT NOT NULL DEFAULT 'status_change'
          CHECK(type IN ('status_change','note','entretien','document','email','email_sent','email_failed','email_open')),
        statut_from TEXT,
        statut_to TEXT,
        notes TEXT,
        content_md TEXT,
        email_snapshot TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO candidature_events_new (id, candidature_id, type, statut_from, statut_to, notes, created_by, created_at)
        SELECT id, candidature_id, type, statut_from, statut_to, notes, created_by, created_at FROM candidature_events;
      DROP TABLE candidature_events;
      ALTER TABLE candidature_events_new RENAME TO candidature_events;
      CREATE INDEX IF NOT EXISTS idx_candidature_events ON candidature_events(candidature_id, created_at);
    `)
  }

  // Idempotent migration: add 'evaluation_reopened' and 'onboarding' to candidature_events CHECK
  const missingNewEventTypes = (() => {
    const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='candidature_events'").get() as { sql: string } | undefined
    return tableInfo?.sql?.includes("'email_open'") && !tableInfo?.sql?.includes("'evaluation_reopened'")
  })()

  if (missingNewEventTypes) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS candidature_events_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        candidature_id TEXT NOT NULL REFERENCES candidatures(id) ON DELETE CASCADE,
        type TEXT NOT NULL DEFAULT 'status_change'
          CHECK(type IN ('status_change','note','entretien','document','email','email_sent','email_failed','email_open','evaluation_reopened','onboarding')),
        statut_from TEXT,
        statut_to TEXT,
        notes TEXT,
        content_md TEXT,
        email_snapshot TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO candidature_events_new SELECT * FROM candidature_events;
      DROP TABLE candidature_events;
      ALTER TABLE candidature_events_new RENAME TO candidature_events;
      CREATE INDEX IF NOT EXISTS idx_candidature_events ON candidature_events(candidature_id, created_at);
    `)
  }

  // Idempotent: add content_md and email_snapshot if table has new CHECK but missing columns
  try { db.exec('ALTER TABLE candidature_events ADD COLUMN content_md TEXT') } catch { /* already exists */ }
  try { db.exec('ALTER TABLE candidature_events ADD COLUMN email_snapshot TEXT') } catch { /* already exists */ }

  // Idempotent migration: widen CHECK to add email_clicked / email_delivered / email_complained / email_delay.
  // Wrapped in an explicit transaction so a pod crash between DROP and RENAME
  // cannot leave the schema in an unrecoverable "main table gone, temp table
  // orphaned" state. `DROP TABLE IF EXISTS candidature_events_new` first cleans
  // up any orphan temp table left by a prior crashed attempt.
  const missingDeliverabilityEventTypes = (() => {
    const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='candidature_events'").get() as { sql: string } | undefined
    return !!tableInfo?.sql && !tableInfo.sql.includes("'email_clicked'")
  })()

  if (missingDeliverabilityEventTypes) {
    db.exec('DROP TABLE IF EXISTS candidature_events_new')
    const migrate = db.transaction(() => {
      db.exec(`
        CREATE TABLE candidature_events_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          candidature_id TEXT NOT NULL REFERENCES candidatures(id) ON DELETE CASCADE,
          type TEXT NOT NULL DEFAULT 'status_change'
            CHECK(type IN ('status_change','note','entretien','document','email','email_sent','email_failed','email_open','email_clicked','email_delivered','email_complained','email_delay','evaluation_reopened','onboarding')),
          statut_from TEXT,
          statut_to TEXT,
          notes TEXT,
          content_md TEXT,
          email_snapshot TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO candidature_events_new (id, candidature_id, type, statut_from, statut_to, notes, content_md, email_snapshot, created_by, created_at)
          SELECT id, candidature_id, type, statut_from, statut_to, notes, content_md, email_snapshot, created_by, created_at
          FROM candidature_events;
        DROP TABLE candidature_events;
        ALTER TABLE candidature_events_new RENAME TO candidature_events;
      `)
    })
    migrate()
    db.exec('CREATE INDEX IF NOT EXISTS idx_candidature_events ON candidature_events(candidature_id, created_at)')
  }

  // Idempotent: add event_id FK to candidature_documents for linking files to transition events
  try { db.exec('ALTER TABLE candidature_documents ADD COLUMN event_id INTEGER REFERENCES candidature_events(id)') } catch { /* already exists */ }
  db.exec('CREATE INDEX IF NOT EXISTS idx_documents_event ON candidature_documents(event_id)')

  // Idempotent: add malware scan columns to candidature_documents
  try { db.exec("ALTER TABLE candidature_documents ADD COLUMN scan_status TEXT DEFAULT 'pending'") } catch { /* already exists */ }
  try { db.exec('ALTER TABLE candidature_documents ADD COLUMN scan_result TEXT') } catch { /* already exists */ }
  try { db.exec('ALTER TABLE candidature_documents ADD COLUMN scanned_at TEXT') } catch { /* already exists */ }
  try { db.exec('ALTER TABLE candidature_documents ADD COLUMN display_filename TEXT') } catch { /* already exists */ }
  try { db.exec('ALTER TABLE candidature_documents ADD COLUMN deleted_at TEXT') } catch { /* already exists */ }
  try { db.exec('ALTER TABLE candidature_documents ADD COLUMN replaces_document_id TEXT REFERENCES candidature_documents(id)') } catch { /* already exists */ }
  db.exec('CREATE INDEX IF NOT EXISTS idx_documents_deleted_at ON candidature_documents(deleted_at)')

  // ─── Idempotent backfill: canonical display_filename + candidate name ─
  // Applies the naming convention defined in server/lib/file-naming.ts to
  // every existing candidate and document. Re-runnable: skips rows already
  // in canonical form.
  try {
    // 1. Normalize candidates.name → "Firstname LASTNAME".
    const nameRows = db.prepare('SELECT id, name FROM candidates').all() as { id: string; name: string }[]
    const updateCandidateName = db.prepare('UPDATE candidates SET name = ? WHERE id = ?')
    let renamedCandidates = 0
    for (const row of nameRows) {
      const normalized = formatDisplayName(row.name)
      if (normalized && normalized !== row.name) {
        updateCandidateName.run(normalized, row.id)
        renamedCandidates++
      }
    }
    if (renamedCandidates > 0) {
      console.log(`[MIGRATION] Normalized ${renamedCandidates} candidate name(s) to "Firstname LASTNAME" format`)
    }

    // 2. Backfill display_filename for documents where it's NULL.
    //    Use the document's created_at as the date in the canonical filename so
    //    retro-named files still match "when it was uploaded".
    const orphanDocs = db.prepare(`
      SELECT d.id, d.type, d.filename, d.created_at, cand.name AS candidate_name
      FROM candidature_documents d
      JOIN candidatures c ON c.id = d.candidature_id
      JOIN candidates cand ON cand.id = c.candidate_id
      WHERE d.display_filename IS NULL
    `).all() as { id: string; type: string; filename: string; created_at: string; candidate_name: string }[]
    const updateDoc = db.prepare('UPDATE candidature_documents SET display_filename = ? WHERE id = ?')
    let renamedDocs = 0
    for (const d of orphanDocs) {
      if (!d.candidate_name) continue
      // CV / Lettre / ABORO keep their original name; everything else gets
      // the canonical NAME_FIRSTNAME_DATE suffix.
      const keepsOriginalName = d.type === 'cv' || d.type === 'lettre' || d.type === 'aboro'
      const parsed = new Date(d.created_at.replace(' ', 'T') + 'Z')
      const display = keepsOriginalName
        ? d.filename
        : buildCanonicalFilename(d.candidate_name, d.filename, isNaN(+parsed) ? new Date() : parsed)
      updateDoc.run(display, d.id)
      renamedDocs++
    }
    if (renamedDocs > 0) {
      console.log(`[MIGRATION] Backfilled display_filename for ${renamedDocs} document(s)`)
    }
  } catch (err) {
    console.error('[MIGRATION] File-naming backfill failed (non-blocking):', err)
  }

  // ─── Undo canonical renaming on CV / Lettre / ABORO ─────────────────
  // Earlier versions applied buildCanonicalFilename() to every upload,
  // including the three "primary" document slots. Those slots now keep
  // their original uploader filename (the type badge in the UI carries
  // the identity). Reset display_filename → filename for rows that look
  // auto-renamed. The GLOB pattern matches "*_LASTNAME_FIRSTNAME_YYYYMMDD.*"
  // so we only touch canonical-shaped names, leaving any human-renamed
  // files intact.
  try {
    const result = db.prepare(`
      UPDATE candidature_documents
      SET display_filename = filename
      WHERE type IN ('cv', 'lettre', 'aboro')
        AND display_filename IS NOT NULL
        AND display_filename != filename
        AND display_filename GLOB '*_[A-Z]*_[A-Z]*_[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9].*'
    `).run()
    if (result.changes > 0) {
      console.log(`[MIGRATION] Reset display_filename → filename on ${result.changes} CV/lettre/aboro document(s)`)
    }
  } catch (err) {
    console.error('[MIGRATION] CV/lettre/aboro rename reset failed (non-blocking):', err)
  }

  // ─── One-shot dedup of candidates by email ──────────────────────────
  // Before the intake fix shipped, applying to two postes with the same email
  // created two `candidates` rows. Walk leftover duplicates, pick the OLDEST as
  // canonical, merge data, re-point candidatures + aboro_profiles, delete the
  // duplicates. Idempotent — no-op when no duplicates exist.
  //
  // Safety:
  // - Normalises with LOWER + TRIM (catches " marie@x.com" duplicates).
  // - Snapshots dropped fields (experience, skipped_categories) into the
  //   canonical's notes BEFORE losing them, so a recruiter can recover.
  // - Resolves the UNIQUE(candidate_id, poste_id) conflict that arises when
  //   two duplicate candidate rows BOTH have a candidature for the same poste:
  //   we pick the oldest candidature, merge events into it, drop the others.
  try {
    const dupes = db.prepare(`
      SELECT LOWER(TRIM(email)) AS norm_email, COUNT(*) AS n
      FROM candidates
      WHERE email IS NOT NULL AND TRIM(email) != ''
      GROUP BY LOWER(TRIM(email))
      HAVING COUNT(*) > 1
    `).all() as { norm_email: string; n: number }[]

    if (dupes.length > 0) {
      console.log(`[DEDUP] Found ${dupes.length} email(s) with duplicate candidate rows`)
      // For data fields (cv_text, ai_suggestions, ratings, …) keep canonical's
      // value when non-null/non-empty: the OLDEST candidate is the
      // most-curated source.
      const mergeNonNull = db.prepare(`
        UPDATE candidates SET
          cv_text = COALESCE(cv_text, (SELECT cv_text FROM candidates WHERE id = ?)),
          ai_suggestions = COALESCE(ai_suggestions, (SELECT ai_suggestions FROM candidates WHERE id = ?)),
          ai_report = COALESCE(ai_report, (SELECT ai_report FROM candidates WHERE id = ?)),
          ratings = CASE WHEN ratings = '{}' OR ratings IS NULL OR ratings = '' THEN (SELECT ratings FROM candidates WHERE id = ?) ELSE ratings END,
          experience = CASE WHEN experience = '{}' OR experience IS NULL OR experience = '' THEN (SELECT experience FROM candidates WHERE id = ?) ELSE experience END,
          skipped_categories = CASE WHEN skipped_categories = '[]' OR skipped_categories IS NULL OR skipped_categories = '' THEN (SELECT skipped_categories FROM candidates WHERE id = ?) ELSE skipped_categories END,
          submitted_at = COALESCE(submitted_at, (SELECT submitted_at FROM candidates WHERE id = ?))
        WHERE id = ?
      `)
      // For contact fields, the NEWEST non-null value wins — the candidate's
      // most recent application probably has their freshest phone/address.
      // We iterate duplicates oldest→newest, overwriting canonical only when
      // the duplicate's value is non-null. End state = newest-non-null.
      const mergeContactPreferDup = db.prepare(`
        UPDATE candidates SET
          telephone = CASE WHEN (SELECT telephone FROM candidates WHERE id = ?) IS NOT NULL THEN (SELECT telephone FROM candidates WHERE id = ?) ELSE telephone END,
          pays = CASE WHEN (SELECT pays FROM candidates WHERE id = ?) IS NOT NULL THEN (SELECT pays FROM candidates WHERE id = ?) ELSE pays END,
          linkedin_url = CASE WHEN (SELECT linkedin_url FROM candidates WHERE id = ?) IS NOT NULL THEN (SELECT linkedin_url FROM candidates WHERE id = ?) ELSE linkedin_url END,
          github_url = CASE WHEN (SELECT github_url FROM candidates WHERE id = ?) IS NOT NULL THEN (SELECT github_url FROM candidates WHERE id = ?) ELSE github_url END
        WHERE id = ?
      `)
      const appendNotes = db.prepare(`
        UPDATE candidates
        SET notes = COALESCE(notes, '') || CASE WHEN notes IS NULL OR notes = '' THEN '' ELSE '\n\n' END || ?
        WHERE id = ?
      `)
      const dupCandidatureForPoste = db.prepare(
        'SELECT c.id, c.created_at FROM candidatures c WHERE c.candidate_id = ? AND c.poste_id = ? ORDER BY c.created_at ASC'
      )
      const repointCandidaturesByPoste = db.prepare(
        'UPDATE candidatures SET candidate_id = ? WHERE candidate_id = ? AND poste_id = ?'
      )
      const moveEventsToCandidature = db.prepare(
        'UPDATE candidature_events SET candidature_id = ? WHERE candidature_id = ?'
      )
      const moveDocsToCandidature = db.prepare(
        'UPDATE candidature_documents SET candidature_id = ? WHERE candidature_id = ?'
      )
      const deleteCandidature = db.prepare('DELETE FROM candidatures WHERE id = ?')
      const repointAboro = db.prepare(
        'UPDATE aboro_profiles SET candidate_id = ? WHERE candidate_id = ?'
      )
      const deleteDuplicate = db.prepare('DELETE FROM candidates WHERE id = ?')

      const merge = db.transaction((normEmail: string) => {
        const rows = db.prepare(
          'SELECT id, name, role, experience, skipped_categories, created_at FROM candidates WHERE LOWER(TRIM(email)) = ? ORDER BY created_at ASC'
        ).all(normEmail) as { id: string; name: string; role: string; experience: string; skipped_categories: string; created_at: string }[]
        if (rows.length < 2) return
        const canonical = rows[0]
        const duplicates = rows.slice(1)

        for (const dup of duplicates) {
          // 0. Snapshot anything we might drop into canonical.notes for audit.
          const auditBits: string[] = [`[DEDUP ${new Date().toISOString().slice(0, 10)}] merged duplicate ${dup.id} (created ${dup.created_at}) name="${dup.name}" role="${dup.role}"`]
          if (dup.experience && dup.experience !== '{}' && canonical.experience && canonical.experience !== '{}') {
            auditBits.push(`dropped experience JSON: ${dup.experience}`)
          }
          if (dup.skipped_categories && dup.skipped_categories !== '[]' && canonical.skipped_categories && canonical.skipped_categories !== '[]') {
            auditBits.push(`dropped skipped_categories: ${dup.skipped_categories}`)
          }

          // 1a. Pull non-null DATA fields from dup into canonical (canonical wins ties).
          mergeNonNull.run(
            dup.id, dup.id, dup.id, dup.id, dup.id, dup.id, dup.id,
            canonical.id,
          )
          // 1b. Pull non-null CONTACT fields, preferring the dup (newer wins
          //     because we iterate duplicates oldest→newest).
          mergeContactPreferDup.run(
            dup.id, dup.id, dup.id, dup.id, dup.id, dup.id, dup.id, dup.id,
            canonical.id,
          )

          // 2. Resolve UNIQUE(candidate_id, poste_id) conflict for shared postes:
          //    if BOTH dup and canonical have a candidature for the same poste,
          //    keep the older candidature, move all events + docs to it, delete
          //    the dup's candidature. Otherwise just re-point.
          const dupPostes = db.prepare(
            'SELECT id, poste_id FROM candidatures WHERE candidate_id = ?'
          ).all(dup.id) as { id: string; poste_id: string }[]
          for (const dupCand of dupPostes) {
            const sameOnCanonical = dupCandidatureForPoste.all(canonical.id, dupCand.poste_id) as { id: string; created_at: string }[]
            if (sameOnCanonical.length > 0) {
              const keepId = sameOnCanonical[0].id
              moveEventsToCandidature.run(keepId, dupCand.id)
              moveDocsToCandidature.run(keepId, dupCand.id)
              deleteCandidature.run(dupCand.id)
              auditBits.push(`merged candidature ${dupCand.id} into ${keepId} (same poste ${dupCand.poste_id})`)
            } else {
              repointCandidaturesByPoste.run(canonical.id, dup.id, dupCand.poste_id)
            }
          }

          // 3. Re-point aboro_profiles (no UNIQUE constraint, all rows preserved).
          repointAboro.run(canonical.id, dup.id)

          // 4. Append the audit trail to canonical.notes BEFORE deleting dup.
          appendNotes.run(auditBits.join('\n'), canonical.id)

          // 5. Delete the now-orphan duplicate candidate.
          deleteDuplicate.run(dup.id)
        }
        console.log(`[DEDUP] Merged ${duplicates.length} duplicate(s) for email ${normEmail} → canonical ${canonical.id}`)
      })
      for (const d of dupes) merge(d.norm_email)
    }
  } catch (err) {
    console.error('[DEDUP] Migration failed:', err)
    // Non-fatal — server still boots, dedup retried next start
  }

  // Belt-and-braces UNIQUE index on normalized email so a parallel intake
  // burst can't slip a duplicate past the application-level dedup. Created
  // AFTER the migration runs so existing duplicates don't block index creation.
  try {
    db.exec(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_candidates_email_unique ON candidates(LOWER(TRIM(email))) WHERE email IS NOT NULL AND TRIM(email) != ''"
    )
  } catch (err) {
    console.error('[DEDUP] UNIQUE index on candidates(email) failed (likely duplicates remain):', err)
  }

  // ─── Item 2 / 10 / 11 / 12 — extraction stack ──────────────────────
  // Schema only. Extractor refactor + UI ride on top in follow-up commits.
  // Spec: docs/decisions/2026-04-20-extraction-architecture.md
  db.exec(`
    CREATE TABLE IF NOT EXISTS candidate_extractions (
      id TEXT PRIMARY KEY,
      candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('cv', 'aboro')),
      run_id TEXT NOT NULL,
      prompt_version INTEGER NOT NULL,
      model_version TEXT NOT NULL,
      input_hash TEXT NOT NULL,
      raw_output TEXT NOT NULL,
      parsed_output TEXT NOT NULL,
      merge_strategy TEXT NOT NULL DEFAULT 'additive'
        CHECK(merge_strategy IN ('additive', 'recruiter-curated', 'replace')),
      cost_eur REAL,
      input_tokens INTEGER,
      output_tokens INTEGER,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
  db.exec('CREATE INDEX IF NOT EXISTS idx_candidate_extractions_candidate ON candidate_extractions(candidate_id, type, created_at DESC)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_candidate_extractions_run ON candidate_extractions(run_id)')

  db.exec(`
    CREATE TABLE IF NOT EXISTS candidate_field_overrides (
      candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
      field_name TEXT NOT NULL,
      value TEXT NOT NULL,
      source TEXT NOT NULL CHECK(source IN ('recruiter', 'extraction')),
      locked_by TEXT,
      locked_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (candidate_id, field_name)
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS extraction_usage (
      user_slug TEXT NOT NULL,
      day TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      tokens_spent INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_slug, day)
    )
  `)

  // Scan verdict overrides — recruiter can mark a flagged file as safe
  // (or quarantine a clean one) for a bounded incident window.
  db.exec(`
    CREATE TABLE IF NOT EXISTS scan_overrides (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES candidature_documents(id) ON DELETE CASCADE,
      verdict TEXT NOT NULL CHECK(verdict IN ('safe', 'quarantine')),
      reason TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
  db.exec('CREATE INDEX IF NOT EXISTS idx_scan_overrides_document ON scan_overrides(document_id, expires_at)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_documents_scan_status ON candidature_documents(scan_status)')

  // Idempotent column additions for soft skill scoring + global score
  try { db.exec('ALTER TABLE candidatures ADD COLUMN taux_soft_skills REAL') } catch { /* already exists */ }
  try { db.exec('ALTER TABLE candidatures ADD COLUMN soft_skill_alerts TEXT') } catch { /* already exists */ }
  try { db.exec('ALTER TABLE candidatures ADD COLUMN taux_global REAL') } catch { /* already exists */ }

  // Fiche de poste free-text description — fed to the CV-matching LLM prompt
  // for contextual, role-aware rating + custom skill-radar questions.
  try { db.exec('ALTER TABLE postes ADD COLUMN description TEXT') } catch { /* already exists */ }

  // CV-extraction enrichment: per-skill reasoning + per-skill questions
  // generated from CV evidence vs. fiche de poste. Shown to the candidate in
  // the skill-radar form to validate the auto-filled rating.
  try { db.exec('ALTER TABLE candidates ADD COLUMN ai_reasoning TEXT') } catch { /* already exists */ }
  try { db.exec('ALTER TABLE candidates ADD COLUMN ai_questions TEXT') } catch { /* already exists */ }

  // Extraction state machine (CV Intelligence v1, Phase 0).
  // Status values: idle | running | succeeded | partial | failed.
  // `partial` = extraction produced usable suggestions but a downstream scoring
  // step failed for ≥1 candidature. Never use `succeeded` with fake 0% scores.
  try { db.exec("ALTER TABLE candidates ADD COLUMN extraction_status TEXT DEFAULT 'idle' CHECK(extraction_status IN ('idle','running','succeeded','partial','failed'))") } catch { /* already exists */ }
  try { db.exec('ALTER TABLE candidates ADD COLUMN extraction_attempts INTEGER DEFAULT 0') } catch { /* already exists */ }
  try { db.exec('ALTER TABLE candidates ADD COLUMN last_extraction_at TEXT') } catch { /* already exists */ }
  try { db.exec('ALTER TABLE candidates ADD COLUMN last_extraction_error TEXT') } catch { /* already exists */ }
  try { db.exec('ALTER TABLE candidates ADD COLUMN prompt_version INTEGER DEFAULT 1') } catch { /* already exists */ }

  // CV Intelligence v1, Phase 1 — auditability foundation.
  //
  // candidate_assets: content-addressed storage for CV text / lettre text /
  // future raw PDFs. Dedupes per-candidate by sha256 so the same CV uploaded
  // twice = one row. `storage_path` points at the on-disk file (local dev)
  // or GCS key (prod migration, deferred).
  //
  // cv_extraction_runs: one row per LLM invocation. Snapshots poste, prompt
  // version, catalog version, model, source document hashes. Payload
  // retention is policy-driven: keep N latest successful payloads, drop
  // older ones to metadata-only, purge after N days.
  db.exec(`
    CREATE TABLE IF NOT EXISTS candidate_assets (
      id TEXT PRIMARY KEY,
      candidate_id TEXT REFERENCES candidates(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK(kind IN ('cv_text','lettre_text','raw_pdf','photo')),
      mime TEXT,
      size_bytes INTEGER,
      sha256 TEXT NOT NULL,
      storage_path TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(candidate_id, kind, sha256)
    );
    CREATE INDEX IF NOT EXISTS idx_candidate_assets_candidate ON candidate_assets(candidate_id, kind);

    CREATE TABLE IF NOT EXISTS cv_extraction_runs (
      id TEXT PRIMARY KEY,
      candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
      candidature_id TEXT REFERENCES candidatures(id) ON DELETE SET NULL,
      kind TEXT NOT NULL CHECK(kind IN (
        'skills_baseline',
        'skills_role_aware',
        'profile',
        'critique',
        'reconcile'
      )),
      run_index INTEGER NOT NULL,
      poste_id TEXT REFERENCES postes(id),
      poste_snapshot TEXT,
      catalog_version TEXT,
      prompt_version INTEGER NOT NULL,
      model TEXT NOT NULL,
      cv_asset_id TEXT REFERENCES candidate_assets(id),
      lettre_asset_id TEXT REFERENCES candidate_assets(id),
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      finished_at TEXT,
      status TEXT CHECK(status IN ('running','success','partial','failed')),
      input_tokens INTEGER,
      output_tokens INTEGER,
      payload TEXT,
      error TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_cv_runs_candidate ON cv_extraction_runs(candidate_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_cv_runs_kind ON cv_extraction_runs(candidate_id, kind, started_at DESC);
  `)

  // retention_days ALTER is deferred — scoring_weights is created later in
  // initDatabase (see seedPostes block). We add it after the CREATE runs.

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

  // Retention window (days) for cv_extraction_runs payloads. NULL-payload
  // rows older than this get dropped entirely by extraction-retention.ts.
  try { db.exec('ALTER TABLE scoring_weights ADD COLUMN retention_days INTEGER DEFAULT 90') } catch { /* already exists */ }

  // CV Intelligence Phase 4 — structured candidate profile (JSON).
  //
  // Holds identity/contact/location/education/experience/languages/
  // certifications/publications/openSource/availability/softSignals/
  // additionalFacts — all with per-field provenance via ProfileField<T>.
  // Sensitive fields (DOB/gender/nationality/marital status/salary/photo)
  // are explicitly OUT OF SCOPE for v1 per product rule (v4 plan).
  //
  // Merge semantics: writes go through profile-merge.ts which uses
  // UPDATE ... WHERE humanLockedAt IS NULL so re-extraction can never
  // overwrite a recruiter-verified value, even under race conditions.
  try { db.exec('ALTER TABLE candidates ADD COLUMN ai_profile TEXT') } catch { /* already exists */ }

  // CV Intelligence Phase 3 — per-candidature role-aware skill ratings.
  //
  // When a candidature's poste has a non-null `description`, the pipeline runs
  // a second extraction that includes the fiche as a <reference> block. The
  // resulting ratings map is stored here per-candidature so each candidature
  // keeps its own calibration. NULL means "no role-aware pass done — score
  // with candidate-level ai_suggestions baseline".
  try { db.exec('ALTER TABLE candidatures ADD COLUMN role_aware_suggestions TEXT') } catch { /* already exists */ }
  try { db.exec('ALTER TABLE candidatures ADD COLUMN role_aware_reasoning TEXT') } catch { /* already exists */ }
  try { db.exec('ALTER TABLE candidatures ADD COLUMN role_aware_questions TEXT') } catch { /* already exists */ }

  // Migration: allow 'photo' kind in candidate_assets. Older DBs had a CHECK
  // constraint restricted to ('cv_text','lettre_text','raw_pdf'). SQLite
  // can't ALTER an existing CHECK — rebuild the table in place.
  //
  // CRITICAL: use PRAGMA legacy_alter_table=ON before the RENAME. Without it,
  // SQLite auto-rewrites FK references in OTHER tables to point at the new
  // name (e.g. cv_extraction_runs.cv_asset_id ends up referencing
  // 'candidate_assets_legacy', which we then drop — breaking every future
  // insert). This bit us once; don't let it happen again.
  try {
    const existing = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='candidate_assets'").get() as { sql: string } | undefined
    if (existing && !existing.sql.includes("'photo'")) {
      db.exec('PRAGMA foreign_keys=OFF')
      db.exec('PRAGMA legacy_alter_table=ON')
      db.exec(`
        BEGIN;
        ALTER TABLE candidate_assets RENAME TO candidate_assets_legacy;
        CREATE TABLE candidate_assets (
          id TEXT PRIMARY KEY,
          candidate_id TEXT REFERENCES candidates(id) ON DELETE CASCADE,
          kind TEXT NOT NULL CHECK(kind IN ('cv_text','lettre_text','raw_pdf','photo')),
          mime TEXT,
          size_bytes INTEGER,
          sha256 TEXT NOT NULL,
          storage_path TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(candidate_id, kind, sha256)
        );
        INSERT INTO candidate_assets SELECT id, candidate_id, kind, mime, size_bytes, sha256, storage_path, created_at FROM candidate_assets_legacy;
        DROP TABLE candidate_assets_legacy;
        CREATE INDEX IF NOT EXISTS idx_candidate_assets_candidate ON candidate_assets(candidate_id, kind);
        COMMIT;
      `)
      db.exec('PRAGMA legacy_alter_table=OFF')
      db.exec('PRAGMA foreign_keys=ON')
    }
  } catch (err) {
    console.warn('[db] candidate_assets CHECK rebuild skipped:', err instanceof Error ? err.message : err)
    try { db.exec('ROLLBACK') } catch { /* no active tx */ }
    try { db.exec('PRAGMA legacy_alter_table=OFF') } catch { /* ignore */ }
    try { db.exec('PRAGMA foreign_keys=ON') } catch { /* ignore */ }
  }

  // Healer: patch DBs corrupted by the earlier version of the migration above.
  // If cv_extraction_runs still has FK refs pointing at 'candidate_assets_legacy',
  // rewrite its CREATE TABLE sql in sqlite_master. Safe: same columns, only the
  // referenced table name changes. Requires writable_schema.
  try {
    const runs = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='cv_extraction_runs'").get() as { sql: string } | undefined
    if (runs && runs.sql.includes('candidate_assets_legacy')) {
      db.exec('PRAGMA writable_schema=1')
      db.prepare(
        "UPDATE sqlite_master SET sql = replace(sql, 'candidate_assets_legacy', 'candidate_assets') WHERE type='table' AND name='cv_extraction_runs'",
      ).run()
      db.exec('PRAGMA writable_schema=0')
      console.log('[db] healed cv_extraction_runs FK refs (candidate_assets_legacy → candidate_assets)')
    }
  } catch (err) {
    console.warn('[db] cv_extraction_runs FK heal skipped:', err instanceof Error ? err.message : err)
    try { db.exec('PRAGMA writable_schema=0') } catch { /* ignore */ }
  }

  // Per-skill target levels with requis/apprécié weighting for compatibility scoring
  db.exec(`
    CREATE TABLE IF NOT EXISTS poste_skill_requirements (
      poste_id TEXT NOT NULL REFERENCES postes(id) ON DELETE CASCADE,
      skill_id TEXT NOT NULL REFERENCES skills(id),
      target_level INTEGER NOT NULL DEFAULT 3 CHECK(target_level BETWEEN 1 AND 5),
      importance TEXT NOT NULL DEFAULT 'requis' CHECK(importance IN ('requis', 'apprecie')),
      PRIMARY KEY (poste_id, skill_id)
    )
  `)

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
      {
        id: 'candidature-libre',
        label: 'Candidature Libre',
        categories: [
          'core-engineering', 'backend-integration', 'frontend-ui', 'platform-engineering',
          'observability-reliability', 'security-compliance', 'architecture-governance',
          'soft-skills-delivery', 'domain-knowledge', 'ai-engineering', 'qa-test-engineering',
          'infrastructure-systems-network', 'analyse-fonctionnelle', 'project-management-pmo',
          'change-management-training', 'design-ux', 'data-engineering-governance',
          'management-leadership', 'legacy-ibmi-adelia', 'javaee-jboss',
        ],
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
      { id: 'candidature-libre', roleId: 'candidature-libre', titre: 'Candidature Libre', pole: 'java_modernisation', headcount: 99, flexible: true, expMin: 0, cigref: '' },
    ]

    const catExistsCheck = db.prepare('SELECT 1 FROM categories WHERE id = ?')
    const seedPostes = db.transaction(() => {
      for (const role of recruitmentRoles) {
        insertRole.run(role.id, role.label, 'system')
        for (const catId of role.categories) {
          if (catExistsCheck.get(catId)) insertCat.run(role.id, catId)
        }
      }
      for (const p of postes) {
        insertPoste.run(p.id, p.roleId, p.titre, p.pole, p.headcount, p.flexible ? 1 : 0, p.expMin, p.cigref, 'CDIC')
      }
    })
    seedPostes()
  }

  // Idempotent: add candidature-libre role + poste (for candidates who don't target a specific job)
  const allCatIds = (db.prepare('SELECT id FROM categories').all() as { id: string }[]).map(r => r.id)
  if (allCatIds.length > 0) {
    db.prepare("INSERT OR IGNORE INTO roles (id, label, created_by) VALUES ('candidature-libre', 'Candidature Libre', 'system')").run()
    for (const catId of allCatIds) {
      db.prepare("INSERT OR IGNORE INTO role_categories (role_id, category_id) VALUES ('candidature-libre', ?)").run(catId)
    }
    db.prepare(`INSERT OR IGNORE INTO postes (id, role_id, titre, pole, headcount, headcount_flexible, experience_min, cigref, contrat)
      VALUES ('candidature-libre', 'candidature-libre', 'Candidature Libre', 'java_modernisation', 99, 1, 0, '', 'CDIC')`).run()
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
        'legacy-ibmi-adelia', 'javaee-jboss', 'core-engineering',
        'architecture-governance', 'soft-skills-delivery', 'domain-knowledge',
      ],
      java_modernisation: [
        'core-engineering', 'backend-integration', 'frontend-ui',
        'platform-engineering', 'observability-reliability', 'security-compliance',
        'ai-engineering', 'qa-test-engineering', 'infrastructure-systems-network',
        'architecture-governance', 'soft-skills-delivery', 'domain-knowledge',
      ],
      fonctionnel: [
        'analyse-fonctionnelle', 'project-management-pmo', 'change-management-training',
        'design-ux', 'data-engineering-governance', 'management-leadership',
        'architecture-governance', 'soft-skills-delivery', 'domain-knowledge',
      ],
    }
    const insertPoleCategory = db.prepare('INSERT INTO pole_categories (pole, category_id) VALUES (?, ?)')
    const catExists = db.prepare('SELECT 1 FROM categories WHERE id = ?')
    db.transaction(() => {
      for (const [pole, cats] of Object.entries(poleMapping)) {
        for (const catId of cats) {
          if (catExists.get(catId)) insertPoleCategory.run(pole, catId)
        }
      }
    })()
  }

  // Migration: ensure infrastructure-systems-network is in java_modernisation pole (if category exists)
  const infraCat = db.prepare("SELECT 1 FROM categories WHERE id = 'infrastructure-systems-network'").get()
  if (infraCat) {
    db.prepare("INSERT OR IGNORE INTO pole_categories (pole, category_id) VALUES ('java_modernisation', 'infrastructure-systems-network')").run()
  }

  // Migration: ensure javaee-jboss is in legacy pole (if category exists)
  const javaEECat = db.prepare("SELECT 1 FROM categories WHERE id = 'javaee-jboss'").get()
  if (javaEECat) {
    db.prepare("INSERT OR IGNORE INTO pole_categories (pole, category_id) VALUES ('legacy', 'javaee-jboss')").run()
  }

  // Migration: add declined_categories column if missing
  const evalCols = db.prepare("PRAGMA table_info(evaluations)").all() as { name: string }[]
  if (!evalCols.some(c => c.name === 'declined_categories')) {
    db.exec("ALTER TABLE evaluations ADD COLUMN declined_categories TEXT DEFAULT '[]'")
  }
  const candCols = db.prepare("PRAGMA table_info(candidates)").all() as { name: string }[]
  if (!candCols.some(c => c.name === 'declined_categories')) {
    db.exec("ALTER TABLE candidates ADD COLUMN declined_categories TEXT DEFAULT '[]'")
  }

  // Migration: add version column to candidates
  const candidateCols = db.prepare("PRAGMA table_info(candidates)").all() as { name: string }[]
  if (!candidateCols.some(c => c.name === 'version')) {
    db.exec("ALTER TABLE candidates ADD COLUMN version INTEGER NOT NULL DEFAULT 1")
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
    declined_categories: string
    submitted_at: string | null
    profile_summary: string | null
  }[]

  const result: Record<string, MemberEvaluation> = {}
  for (const row of rows) {
    result[row.slug] = {
      ratings: safeJsonParse(row.ratings, {}, 'evaluations.ratings'),
      experience: safeJsonParse(row.experience, {}, 'evaluations.experience'),
      skippedCategories: safeJsonParse(row.skipped_categories, [] as string[], 'evaluations.skipped_categories'),
      declinedCategories: safeJsonParse(row.declined_categories, [] as string[], 'evaluations.declined_categories'),
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
    declined_categories: string
    submitted_at: string | null
    profile_summary: string | null
  } | undefined

  if (!row) return null

  return {
    ratings: safeJsonParse(row.ratings, {}, 'evaluations.ratings'),
    experience: safeJsonParse(row.experience, {}, 'evaluations.experience'),
    skippedCategories: safeJsonParse(row.skipped_categories, [] as string[], 'evaluations.skipped_categories'),
    declinedCategories: safeJsonParse(row.declined_categories, [] as string[], 'evaluations.declined_categories'),
    submittedAt: row.submitted_at,
    profileSummary: row.profile_summary ?? null,
  }
}

export function upsertEvaluation(
  slug: string,
  ratings: Record<string, number>,
  experience: Record<string, number>,
  skippedCategories: string[],
  declinedCategories: string[] = [],
): MemberEvaluation {
  db.prepare(`
    INSERT INTO evaluations (slug, ratings, experience, skipped_categories, declined_categories)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET
      ratings = excluded.ratings,
      experience = excluded.experience,
      skipped_categories = excluded.skipped_categories,
      declined_categories = excluded.declined_categories
  `).run(
    slug,
    JSON.stringify(ratings),
    JSON.stringify(experience),
    JSON.stringify(skippedCategories),
    JSON.stringify(declinedCategories),
  )

  return getEvaluation(slug)!
}

export function submitEvaluation(slug: string): MemberEvaluation | null {
  const now = new Date().toISOString()
  db.prepare('UPDATE evaluations SET submitted_at = ? WHERE slug = ?').run(now, slug)
  return getEvaluation(slug)
}

/**
 * Record skill-level changes in skill_changes when a full form is re-submitted.
 * Diffs current ratings against the last-known levels from skill_changes.
 * If no prior history exists (first submission), seeds all non-zero ratings.
 */
export function recordSkillChangesOnSubmit(slug: string): void {
  const memberData = getEvaluation(slug)
  if (!memberData) return

  const currentRatings = memberData.ratings

  // Get last-known level per skill from skill_changes
  const rows = db.prepare(
    `SELECT skill_id, new_level FROM skill_changes
     WHERE slug = ? AND (skill_id, changed_at) IN (
       SELECT skill_id, MAX(changed_at) FROM skill_changes WHERE slug = ? GROUP BY skill_id
     )`
  ).all(slug, slug) as { skill_id: string; new_level: number }[]

  const lastKnown = new Map(rows.map(r => [r.skill_id, r.new_level]))
  const now = new Date().toISOString()

  const insert = db.prepare(
    'INSERT INTO skill_changes (slug, skill_id, old_level, new_level, changed_at) VALUES (?, ?, ?, ?, ?)'
  )

  db.transaction(() => {
    for (const [skillId, level] of Object.entries(currentRatings)) {
      const prev = lastKnown.get(skillId)
      if (prev === undefined) {
        // New skill not previously tracked — seed it
        if (level > 0) {
          insert.run(slug, skillId, 0, level, now)
        }
      } else if (prev !== level) {
        // Skill level changed
        insert.run(slug, skillId, prev, level, now)
      }
    }
  })()
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

/**
 * Union of role_categories across every active candidature for this candidate.
 * Used by the self-eval form so a candidate who applied to N postes (potentially
 * across different pôles) sees the union of their categories — answers once,
 * recruiter sees per-poste compatibility scores. Falls back to candidate.role_id
 * when no candidatures exist (manually-created candidate).
 */
export function getCategoriesForCandidate(candidateId: string): string[] {
  const rows = db.prepare(`
    SELECT DISTINCT rc.category_id
    FROM candidatures c
    JOIN postes p ON p.id = c.poste_id
    JOIN role_categories rc ON rc.role_id = p.role_id
    WHERE c.candidate_id = ?
  `).all(candidateId) as { category_id: string }[]
  if (rows.length > 0) return rows.map(r => r.category_id)

  // Fallback for candidates without candidatures (edge case): use the legacy
  // candidates.role_id field, which intake sets to the first applied poste's role.
  const legacy = db.prepare('SELECT role_id FROM candidates WHERE id = ?').get(candidateId) as { role_id: string | null } | undefined
  return legacy?.role_id ? getRoleCategories(legacy.role_id) : []
}

export function getCategoryIdsByPole(): Record<string, string[]> {
  const rows = db.prepare('SELECT pole, category_id FROM pole_categories').all() as { pole: string; category_id: string }[]
  const result: Record<string, string[]> = {}
  for (const r of rows) {
    if (!result[r.pole]) result[r.pole] = []
    result[r.pole].push(r.category_id)
  }
  return result
}
