/**
 * Reset PINs for all users except specified ones.
 * Creates user account for Guillaume Benoit if it doesn't exist.
 * Run on production: node server/scripts/reset-pins.mjs
 */
import crypto from 'crypto'
import Database from 'better-sqlite3'

const DB_PATH = process.env.DB_PATH || '/data/ratings.db'

function hashPassword(pin) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex')
    crypto.scrypt(pin, salt, 64, (err, derivedKey) => {
      if (err) reject(err)
      else resolve(salt + ':' + derivedKey.toString('hex'))
    })
  })
}

function generatePin() {
  return crypto.randomInt(100000, 1000000).toString()
}

function generateId(length = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  const bytes = crypto.randomBytes(length)
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length]
  }
  return result
}

const SKIP_EMAILS = [
  'matthieu.alcime@sinapse.nc',
  'alan.huitel@sinapse.nc',
]

async function main() {
  const db = new Database(DB_PATH)

  // 1. Create Guillaume Benoit if not exists
  const guillaume = db.prepare("SELECT id FROM user WHERE email = ?").get('guillaume.benoit@sinapse.nc')
  if (!guillaume) {
    const userId = generateId()
    const accountId = generateId()
    const pin = generatePin()
    const hash = await hashPassword(pin)
    const now = new Date().toISOString()

    db.prepare("INSERT INTO user (id, name, email, slug, pinCustomized, createdAt, updatedAt, emailVerified) VALUES (?, ?, ?, ?, 0, ?, ?, 1)")
      .run(userId, 'Guillaume BENOIT', 'guillaume.benoit@sinapse.nc', 'guillaume-benoit', now, now)

    db.prepare("INSERT INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt) VALUES (?, ?, 'credential', ?, ?, ?, ?)")
      .run(accountId, userId, userId, hash, now, now)

    console.log(`CREATED: Guillaume BENOIT — PIN: ${pin}`)
  } else {
    console.log('Guillaume BENOIT already exists, will reset PIN with others')
  }

  // 2. Reset PINs for all users except the skip list
  const users = db.prepare(`
    SELECT u.id, u.name, u.email, a.id as accountId
    FROM user u
    JOIN account a ON a.userId = u.id
    WHERE u.email NOT IN (${SKIP_EMAILS.map(() => '?').join(',')})
  `).all(...SKIP_EMAILS)

  for (const user of users) {
    const pin = generatePin()
    const hash = await hashPassword(pin)
    db.prepare("UPDATE account SET password = ? WHERE id = ?").run(hash, user.accountId)
    db.prepare("UPDATE user SET pinCustomized = 0 WHERE id = ?").run(user.id)
    console.log(`RESET: ${user.name} (${user.email}) — PIN: ${pin}`)
  }

  console.log('\n--- SKIPPED (custom PINs preserved) ---')
  for (const email of SKIP_EMAILS) {
    const u = db.prepare("SELECT name FROM user WHERE email = ?").get(email)
    if (u) console.log(`  ${u.name} (${email})`)
  }

  db.close()
}

main().catch(console.error)
