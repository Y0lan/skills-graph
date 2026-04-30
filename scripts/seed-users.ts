import crypto from 'crypto';
import { teamMembers } from '../server/data/team-roster.js';
import { initDatabase, getDb } from '../server/lib/db.js';
import { createAuth } from '../server/lib/auth.js';
const targetSlug = process.argv.find((a) => a.startsWith('--slug='))?.split('=')[1];
await initDatabase();
const auth = createAuth();
const ctx = await auth.$context;
await ctx.runMigrations();
const db = getDb();
if (!targetSlug) {
    if (!process.argv.includes('--force')) {
        console.error('');
        console.error('⚠  Running without --slug= will DELETE ALL auth data.');
        console.error('   To proceed: npm run seed:users -- --force');
        console.error('   Single user: npm run seed:users -- --slug=john-doe');
        console.error('   Back up first: verify a fresh Cloud SQL backup/PITR point.');
        console.error('');
        process.exit(1);
    }
    const count = (await db.prepare('SELECT COUNT(*) as c FROM "user"').get() as {
        c: number;
    }).c;
    console.log(`[SEED] --force: wiping ${count} user(s)...`);
    await db.exec('DELETE FROM session');
    await db.exec('DELETE FROM account');
    await db.exec('DELETE FROM verification');
    await db.exec('DELETE FROM "user"');
    console.log('[SEED] Wiped auth tables');
}
const members = targetSlug
    ? teamMembers.filter((m) => m.slug === targetSlug)
    : teamMembers;
if (members.length === 0) {
    console.error(`[SEED] No member found with slug "${targetSlug}"`);
    process.exit(1);
}
console.log('');
console.log('Nom'.padEnd(35) + 'Mot de passe temporaire');
console.log('-'.repeat(45));
for (const member of members) {
    const temporaryPassword = crypto.randomBytes(18).toString('base64url');
    if (targetSlug) {
        const existingUser = await db.prepare('SELECT id FROM "user" WHERE email = ?').get(member.email) as {
            id: string;
        } | undefined;
        if (existingUser) {
            await db.prepare('DELETE FROM session WHERE userId = ?').run(existingUser.id);
            await db.prepare('DELETE FROM account WHERE userId = ?').run(existingUser.id);
            await db.prepare('DELETE FROM "user" WHERE id = ?').run(existingUser.id);
        }
    }
    await auth.api.signUpEmail({
        body: { email: member.email, password: temporaryPassword, name: member.name },
    });
    console.log(`${member.name.padEnd(35)}${temporaryPassword}`);
}
console.log('');
console.log(`[SEED] ${members.length} user(s) seeded. Production login uses email magic links; these passwords are only Better Auth bootstrap credentials.`);
