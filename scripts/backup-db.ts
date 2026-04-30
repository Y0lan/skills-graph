import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('[BACKUP] DATABASE_URL is required');
  process.exit(1);
}

const backupDir = process.env.BACKUP_DIR || path.join(process.cwd(), 'server', 'data', 'backups');
fs.mkdirSync(backupDir, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupName = `skill-radar-${timestamp}.dump`;
const backupPath = path.join(backupDir, backupName);

try {
  execFileSync('pg_dump', [
    '--format=custom',
    '--no-owner',
    '--no-acl',
    '--file',
    backupPath,
    databaseUrl,
  ], { stdio: 'inherit' });
} catch {
  console.error('[BACKUP] pg_dump failed');
  process.exit(1);
}

const size = (fs.statSync(backupPath).size / 1024).toFixed(1);
console.log(`[BACKUP] Created: ${backupName} (${size} KB)`);
