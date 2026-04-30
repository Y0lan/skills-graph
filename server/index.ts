import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { toNodeHandler } from 'better-auth/node';
import { ratingsRouter } from './routes/ratings.js';
import { categoriesRouter } from './routes/categories.js';
import { membersRouter } from './routes/members.js';
import { aggregatesRouter } from './routes/aggregates.js';
import { catalogRouter } from './routes/catalog.js';
import { chatRouter } from './routes/chat.js';
import { historyRouter } from './routes/history.js';
import { candidatesRouter } from './routes/candidates.js';
import { evaluateRouter } from './routes/evaluate.js';
import { rolesRouter } from './routes/roles.js';
import { recruitmentRouter } from './routes/recruitment.js';
import { initDatabase, getDb } from './lib/db.js';
import { startWatchdog, stopWatchdog } from './lib/extraction-watchdog.js';
import { createAuth } from './lib/auth.js';
import { requireAuth } from './middleware/require-auth.js';
const PORT = parseInt(process.env.PORT || '3001', 10);
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';
await initDatabase();
const auth = createAuth();
// Let Better Auth create/migrate its own tables
const ctx = await auth.$context;
await ctx.runMigrations();
console.log('[AUTH] Better Auth migrations complete');
const app = express();
app.set('trust proxy', 1); // Behind Google HTTPS Load Balancer / Cloud Run.
app.use(cors({
    origin: CORS_ORIGIN,
    credentials: true,
}));
// Better Auth handler for all auth routes — BEFORE express.json()
const authHandler = toNodeHandler(auth);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.all('/api/auth/{*splat}', async (req, res, _next) => {
    try {
        await authHandler(req, res);
    }
    catch (err) {
        console.error('[AUTH-HANDLER] Uncaught error:', err);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Internal auth error' });
        }
    }
});
// Capture the raw JSON body on the Resend webhook path so Svix signature
// verification can use it verbatim. Without this, `express.json()` consumes
// the stream and we fall back to `JSON.stringify(req.body)` — byte-identical
// is not guaranteed, so signatures can fail intermittently.
app.use(express.json({
    // Bumped from 1mb to 5mb in v5.3 (codex P2) — Resend Inbound payloads
    // include quoted HTML threads + attachment metadata that can exceed
    // 1mb on long reply chains. The verify hook below captures rawBody
    // for both outbound (/webhooks/resend) and inbound
    // (/webhooks/resend-inbound) routes for Svix verification.
    limit: '5mb',
    verify: (req: {
        url?: string;
        rawBody?: string;
    }, _res, buf: Buffer) => {
        if (req.url?.includes('/recruitment/webhooks/resend')) {
            req.rawBody = buf.toString('utf-8');
        }
    },
}));
// Server-level timeout: 120s (generous for CV extraction via Anthropic API)
// This prevents truly hung connections, not normal long operations
app.use((_req, res, next) => {
    res.setTimeout(120000);
    next();
});
// Health check
app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
});
// Backup replication health check
app.get('/health/backup', async (_req, res) => {
    try {
        const db = getDb();
        const row = await db.prepare<{
            c: number;
        }>('SELECT COUNT(*) as c FROM evaluations').get();
        if (!row)
            throw new Error('health count query returned no row');
        const dbOk = row.c >= 0;
        res.json({
            status: dbOk ? 'ok' : 'error',
            db: { accessible: dbOk, evaluations: row.c },
            postgres: { configured: !!process.env.DATABASE_URL },
        });
    }
    catch (err) {
        res.status(500).json({
            status: 'error',
            error: (err as Error).message,
        });
    }
});
// Global auth gate — protect all /api/* except auth and catalog
app.use('/api', (req, res, next) => {
    if (req.path.startsWith('/auth/'))
        return next();
    if (req.path === '/catalog' || req.path === '/catalog/')
        return next();
    if (/^\/evaluate\/[^/]+\/(form|ratings|submit)\/?$/.test(req.path))
        return next();
    if (req.path === '/recruitment/intake' || req.path === '/recruitment/intake/')
        return next();
    if (req.path === '/recruitment/webhooks/resend' || req.path === '/recruitment/webhooks/resend/')
        return next();
    if (req.path === '/recruitment/pipeline-health' || req.path === '/recruitment/pipeline-health/')
        return next();
    if (req.path.startsWith('/webhooks/'))
        return next();
    if (req.method === 'GET' && (req.path === '/ratings/status' || req.path === '/ratings/status/'))
        return next();
    return requireAuth(req, res, next);
});
// API routes
app.use('/api/ratings', ratingsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/members', membersRouter);
app.use('/api/aggregates', aggregatesRouter);
app.use('/api/catalog', catalogRouter);
app.use('/api/chat', chatRouter);
app.use('/api/history', historyRouter);
app.use('/api/candidates', candidatesRouter);
app.use('/api/evaluate', evaluateRouter);
app.use('/api/roles', rolesRouter);
app.use('/api/recruitment', recruitmentRouter);
// Dev-only email inspector — renders every transition template + the standalone
// templates with mock data so a designer can iterate without sending real
// emails. Hard-gated: NEVER mounted in production AND requires a recruitment
// lead session even in dev (codex flagged: PII risk if a real candidate's
// data is mocked through it). See docs/decisions/2026-04-20-data-retention…md.
if (process.env.NODE_ENV !== 'production') {
    try {
        const { devEmailsRouter } = await import('./routes/dev-emails.js');
        app.use('/dev/emails', devEmailsRouter);
        console.log('[INIT] /dev/emails preview tool mounted (dev-only)');
    }
    catch (err) {
        console.warn('[INIT] /dev/emails not mounted:', (err as Error).message);
    }
}
// Global error handler — catch any unhandled route errors
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);
    if (!res.headersSent) {
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
});
// Serve static files in production. Hashed asset chunks (Vite bakes the
// content hash into the filename) are safe to cache aggressively because
// a new build produces a new filename. But `index.html` references the
// CURRENT chunk hashes — caching it serves stale chunk references after
// a deploy, which manifests as users seeing yesterday's UI behavior.
// Cache index.html with `no-cache` so the browser revalidates on every
// load, while leaving fingerprinted assets immutable.
const distPath = path.join(process.cwd(), 'dist');
if (fs.existsSync(distPath)) {
    app.use(express.static(distPath, {
        setHeaders: (res, filePath) => {
            if (filePath.endsWith('index.html')) {
                res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            }
            else if (/\.(js|css|woff2?|png|jpe?g|svg|webp)$/.test(filePath)) {
                // Hashed asset — fine to cache for a long time.
                res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            }
        },
    }));
    app.get('{*path}', (_req, res) => {
        // SPA fallback also receives the no-cache treatment so a freshly
        // deployed build is picked up by tabs that were idle through the
        // deploy.
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.sendFile(path.join(distPath, 'index.html'));
    });
}
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    startWatchdog();
});
let shuttingDown = false;
async function shutdown() {
    if (shuttingDown)
        return;
    shuttingDown = true;
    console.log('[SERVER] Shutting down gracefully...');
    stopWatchdog();
    const timeout = setTimeout(() => {
        console.error('[SERVER] Shutdown timed out — forcing exit');
        process.exit(1);
    }, 10000);
    timeout.unref();
    try {
        await new Promise<void>((resolve, reject) => {
            server.close((err?: Error) => {
                if (err)
                    reject(err);
                else
                    resolve();
            });
        });
        await getDb().close();
        clearTimeout(timeout);
        console.log('[SERVER] Closed.');
        process.exit(0);
    }
    catch (err) {
        clearTimeout(timeout);
        console.error('[SERVER] Shutdown failed:', err);
        process.exit(1);
    }
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
// --- Crash protection ---
// Log unhandled rejections but keep running (these are async errors that
// missed a .catch() — the request already failed, no state corruption)
process.on('unhandledRejection', (reason) => {
    console.error('[WARN] Unhandled rejection:', reason);
});
// Uncaught exceptions mean unknown state — log, close server, let k8s restart
process.on('uncaughtException', (err) => {
    console.error('[FATAL] Uncaught exception — shutting down:', err);
    shutdown();
});
