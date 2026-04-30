#!/usr/bin/env node
// Bulk-import fiches-de-poste PDFs into postes.description.
//
// Usage: DATABASE_URL=postgresql://... node scripts/bulk-import-fiches.mjs <pdf-dir> [--apply] [--force]
//
// Dry-run by default; pass --apply to persist.

import fs from 'node:fs'
import path from 'node:path'
import pg from 'pg'
import { extractText } from 'unpdf'
import mammoth from 'mammoth'

const { Pool } = pg

const ANCHORS = [
  { pattern: /archi\s*si/i, posteId: 'poste-6-architecte-si' },
  { pattern: /\bba\s+sinapse\b/i, posteId: 'poste-7-business-analyst' },
  { pattern: /business\s+analyst/i, posteId: 'poste-7-business-analyst' },
  { pattern: /adelia.*tech\s*lead/i, posteId: 'poste-1-tech-lead-adelia' },
  { pattern: /adelia.*dev/i, posteId: 'poste-2-dev-senior-adelia' },
  { pattern: /java.*tech\s*lead/i, posteId: 'poste-3-tech-lead-java' },
  { pattern: /java.*(dev|full\s*stack)/i, posteId: 'poste-4-dev-java-fullstack' },
  { pattern: /jboss.*dev/i, posteId: 'poste-5-dev-jboss-senior' },
]

async function extractPdfText(buffer) {
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) {
    const { value } = await mammoth.extractRawText({ buffer })
    return value
  }
  const { text } = await extractText(new Uint8Array(buffer))
  return Array.isArray(text) ? text.join('\n') : text
}

function bestMatch(filename, posteIds) {
  for (const anchor of ANCHORS) {
    if (anchor.pattern.test(filename) && posteIds.has(anchor.posteId)) {
      return { posteId: anchor.posteId, reason: `anchored by /${anchor.pattern.source}/` }
    }
  }
  return null
}

async function main() {
  const [dir, ...rest] = process.argv.slice(2)
  const apply = rest.includes('--apply')
  const force = rest.includes('--force')
  if (!dir || !process.env.DATABASE_URL) {
    console.error('usage: DATABASE_URL=postgresql://... node scripts/bulk-import-fiches.mjs <pdf-dir> [--apply] [--force]')
    process.exit(1)
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
  try {
    const { rows: postes } = await pool.query('SELECT id, titre, pole, description FROM postes')
    const posteIds = new Set(postes.map((p) => p.id))
    const byId = new Map(postes.map((p) => [p.id, p]))

    const files = fs.readdirSync(dir).filter((f) => /\.(pdf|docx)$/i.test(f)).sort()
    const plan = []
    for (const file of files) {
      const text = await extractPdfText(fs.readFileSync(path.join(dir, file)))
      const match = bestMatch(file, posteIds)
      if (!match) {
        plan.push({ file, unmatched: true, text })
        continue
      }
      plan.push({ file, posteId: match.posteId, reason: match.reason, text })
    }

    console.log('--- PLAN ---')
    for (const item of plan) {
      if (item.unmatched) {
        console.log(`  ${item.file}\n    -> UNMATCHED`)
        continue
      }
      const poste = byId.get(item.posteId)
      const action = poste.description ? (force ? 'OVERWRITE' : 'SKIP (has desc)') : 'SET'
      console.log(`  ${item.file}`)
      console.log(`    -> ${poste.id} (${poste.titre}, ${poste.pole})`)
      console.log(`    action=${action}, chars=${item.text.length}, ${item.reason}`)
    }

    if (!apply) {
      console.log('\nDRY-RUN complete. Re-run with --apply to persist.')
      return
    }

    let updated = 0
    let skipped = 0
    let unmatched = 0
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      for (const item of plan) {
        if (item.unmatched) {
          unmatched++
          continue
        }
        const poste = byId.get(item.posteId)
        if (poste.description && !force) {
          skipped++
          continue
        }
        await client.query('UPDATE postes SET description = $1 WHERE id = $2', [item.text, item.posteId])
        updated++
      }
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }

    console.log(`\n--- APPLIED ---\n  updated:   ${updated}\n  skipped:   ${skipped}\n  unmatched: ${unmatched}`)
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
