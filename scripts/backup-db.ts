import path from 'path'
import fs from 'fs'
import Database from 'better-sqlite3'

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'server', 'data')
const DB_PATH = path.join(DATA_DIR, 'ratings.db')
const BACKUP_DIR = path.join(DATA_DIR, 'backups')

if (!fs.existsSync(DB_PATH)) {
  console.error(`[BACKUP] Database not found: ${DB_PATH}`)
  process.exit(1)
}

fs.mkdirSync(BACKUP_DIR, { recursive: true })

const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
const backupName = `ratings-${timestamp}.db`
const backupPath = path.join(BACKUP_DIR, backupName)

const db = new Database(DB_PATH, { readonly: true })
db.backup(backupPath)
db.close()

const size = (fs.statSync(backupPath).size / 1024).toFixed(1)
console.log(`[BACKUP] Created: ${backupName} (${size} KB)`)
