#!/usr/bin/env node
// Standalone bulk-import of fiches-de-poste PDFs into postes.description.
// No project-internal imports — uses better-sqlite3 + unpdf (prod deps only)
// so it runs inside the skill-radar pod's shipped node_modules.
//
// Usage: node bulk-import-fiches.mjs <pdf-dir> <db-path> [--apply] [--force]
//
// Dry-run by default; pass --apply to persist.

import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { extractText } from 'unpdf'
import mammoth from 'mammoth'

const ANCHORS = [
  { pattern: /archi\s*si/i,               posteId: 'poste-6-architecte-si' },
  { pattern: /\bba\s+sinapse\b/i,         posteId: 'poste-7-business-analyst' },
  { pattern: /business\s+analyst/i,       posteId: 'poste-7-business-analyst' },
  { pattern: /adelia.*tech\s*lead/i,      posteId: 'poste-1-tech-lead-adelia' },
  { pattern: /adelia.*dev/i,              posteId: 'poste-2-dev-senior-adelia' },
  { pattern: /java.*tech\s*lead/i,        posteId: 'poste-3-tech-lead-java' },
  { pattern: /java.*(dev|full\s*stack)/i, posteId: 'poste-4-dev-java-fullstack' },
  { pattern: /jboss.*dev/i,               posteId: 'poste-5-dev-jboss-senior' },
]

async function extractPdfText(buffer) {
  // DOCX (zip header) fallback — some fiches might be .docx upstream.
  if (buffer[0] === 0x50 && buffer[1] === 0x4B) {
    const { value } = await mammoth.extractRawText({ buffer })
    return value
  }
  const { text } = await extractText(new Uint8Array(buffer))
  return Array.isArray(text) ? text.join('\n') : text
}

function bestMatch(filename, posteIds) {
  for (const a of ANCHORS) {
    if (a.pattern.test(filename) && posteIds.has(a.posteId)) {
      return { posteId: a.posteId, reason: `anchored by /${a.pattern.source}/` }
    }
  }
  return null
}

async function main() {
  const [dir, dbPath, ...rest] = process.argv.slice(2)
  const apply = rest.includes('--apply')
  const force = rest.includes('--force')
  if (!dir || !dbPath) {
    console.error('usage: bulk-import-fiches.mjs <pdf-dir> <db-path> [--apply] [--force]')
    process.exit(1)
  }
  console.log(`→ input dir: ${dir}`)
  console.log(`→ DB:        ${dbPath}`)
  console.log(`→ mode:      ${apply ? 'APPLY' : 'DRY-RUN'}${force ? ' (force)' : ''}\n`)

  const db = new Database(dbPath, { readonly: !apply })
  const postes = db.prepare('SELECT id, titre, pole, description FROM postes').all()
  const posteIds = new Set(postes.map(p => p.id))
  const byId = new Map(postes.map(p => [p.id, p]))

  const files = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.pdf')).sort()
  const plan = []
  for (const file of files) {
    const text = await extractPdfText(fs.readFileSync(path.join(dir, file)))
    const match = bestMatch(file, posteIds)
    if (!match) { plan.push({ file, unmatched: true, text }); continue }
    plan.push({ file, posteId: match.posteId, reason: match.reason, text })
  }

  console.log('─── PLAN ───')
  for (const p of plan) {
    if (p.unmatched) { console.log(`  ${p.file}\n    → UNMATCHED`); continue }
    const poste = byId.get(p.posteId)
    const action = poste.description ? (force ? 'OVERWRITE' : 'SKIP (has desc)') : 'SET'
    console.log(`  ${p.file}`)
    console.log(`    → ${poste.id} (${poste.titre}, ${poste.pole})`)
    console.log(`    action=${action}, chars=${p.text.length}, ${p.reason}`)
  }

  if (!apply) { console.log('\nDRY-RUN complete. Re-run with --apply to persist.'); db.close(); return }

  const upd = db.prepare('UPDATE postes SET description = ? WHERE id = ?')
  let updated = 0, skipped = 0, unmatched = 0
  const tx = db.transaction(() => {
    for (const p of plan) {
      if (p.unmatched) { unmatched++; continue }
      const poste = byId.get(p.posteId)
      if (poste.description && !force) { skipped++; continue }
      upd.run(p.text, p.posteId)
      updated++
    }
  })
  tx()
  db.close()
  console.log(`\n─── APPLIED ───\n  updated:   ${updated}\n  skipped:   ${skipped}\n  unmatched: ${unmatched}`)
}

main().catch(err => { console.error(err); process.exit(1) })
