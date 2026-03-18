import crypto from 'crypto'
import path from 'path'
import { teamMembers } from '../server/data/team-roster.js'
import { initDatabase, getDb } from '../server/lib/db.js'
import { createAuth } from '../server/lib/auth.js'

const targetSlug = process.argv.find((a) => a.startsWith('--slug='))?.split('=')[1]

initDatabase()
const auth = createAuth()
const ctx = await auth.$context
await ctx.runMigrations()

const db = getDb()

if (!targetSlug) {
  if (!process.argv.includes('--force')) {
    console.error('')
    console.error('⚠  Running without --slug= will DELETE ALL auth data.')
    console.error('   To proceed: npm run seed:users -- --force')
    console.error('   Single user: npm run seed:users -- --slug=john-doe')
    console.error('   Back up first: npm run backup')
    console.error('')
    process.exit(1)
  }

  // Auto-backup before destructive wipe
  const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'server', 'data')
  const dbPath = path.join(DATA_DIR, 'ratings.db')
  const backupDir = path.join(DATA_DIR, 'backups')
  const { mkdirSync } = await import('fs')
  const Database = (await import('better-sqlite3')).default
  mkdirSync(backupDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = path.join(backupDir, `ratings-${stamp}.db`)
  const srcDb = new Database(dbPath, { readonly: true })
  srcDb.backup(backupPath)
  srcDb.close()
  console.log(`[SEED] Auto-backup: ${backupPath}`)

  const count = (db.prepare('SELECT COUNT(*) as c FROM user').get() as { c: number }).c
  console.log(`[SEED] --force: wiping ${count} user(s)...`)

  db.exec('DELETE FROM session')
  db.exec('DELETE FROM account')
  db.exec('DELETE FROM verification')
  db.exec('DELETE FROM user')
  console.log('[SEED] Wiped auth tables')
}

const members = targetSlug
  ? teamMembers.filter((m) => m.slug === targetSlug)
  : teamMembers

if (members.length === 0) {
  console.error(`[SEED] No member found with slug "${targetSlug}"`)
  process.exit(1)
}

console.log('')
console.log('Nom'.padEnd(35) + 'Code PIN')
console.log('-'.repeat(45))

for (const member of members) {
  const pin = crypto.randomInt(100000, 999999).toString()

  if (targetSlug) {
    const existingUser = db.prepare('SELECT id FROM user WHERE email = ?').get(member.email) as { id: string } | undefined
    if (existingUser) {
      db.prepare('DELETE FROM session WHERE userId = ?').run(existingUser.id)
      db.prepare('DELETE FROM account WHERE userId = ?').run(existingUser.id)
      db.prepare('DELETE FROM user WHERE id = ?').run(existingUser.id)
    }
  }

  await auth.api.signUpEmail({
    body: { email: member.email, password: pin, name: member.name },
  })

  console.log(`${member.name.padEnd(35)}${pin}`)
}

console.log('')
console.log(`[SEED] ${members.length} user(s) seeded.`)
