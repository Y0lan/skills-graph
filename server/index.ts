import express from 'express'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import { toNodeHandler, fromNodeHeaders } from 'better-auth/node'
import { ratingsRouter } from './routes/ratings.js'
import { categoriesRouter } from './routes/categories.js'
import { membersRouter } from './routes/members.js'
import { aggregatesRouter } from './routes/aggregates.js'
import { catalogRouter } from './routes/catalog.js'
import { initDatabase, getDb } from './lib/db.js'
import { createAuth } from './lib/auth.js'

const PORT = parseInt(process.env.PORT || '3001', 10)
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173'

initDatabase()
const auth = createAuth()

// Let Better Auth create/migrate its own tables
const ctx = await auth.$context
await ctx.runMigrations()
console.log('[AUTH] Better Auth migrations complete')

const app = express()

app.use(cors({
  origin: CORS_ORIGIN,
  credentials: true,
}))

// Custom PIN endpoint — BEFORE the auth catch-all, with inline body parser
app.post('/api/auth/customize-pin', express.json(), async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Champs requis' })
    }
    if (!/^\d{6}$/.test(newPassword)) {
      return res.status(400).json({ message: 'Le code doit contenir exactement 6 chiffres' })
    }

    // Step 1: Change password via Better Auth (validates session + current password)
    await auth.api.changePassword({
      body: { currentPassword, newPassword },
      headers: fromNodeHeaders(req.headers),
    })

    // Step 2: Set pinCustomized flag (same request, pseudo-atomic)
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    })
    if (session) {
      getDb().prepare('UPDATE user SET pinCustomized = 1 WHERE id = ?').run(session.user.id)
    }

    res.json({ ok: true })
  } catch (err: unknown) {
    console.error('[AUTH] Customize PIN error:', err)
    const e = err as { status?: number; statusCode?: number; message?: string }
    const status = e?.status ?? e?.statusCode ?? 500
    res.status(status).json({ message: e?.message ?? 'Erreur' })
  }
})

// Better Auth handler for all auth routes — BEFORE express.json()
const authHandler = toNodeHandler(auth)
app.all('/api/auth/{*splat}', async (req, res, _next) => {
  try {
    await authHandler(req, res)
  } catch (err) {
    console.error('[AUTH-HANDLER] Uncaught error:', err)
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal auth error' })
    }
  }
})

app.use(express.json())

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

// API routes
app.use('/api/ratings', ratingsRouter)
app.use('/api/categories', categoriesRouter)
app.use('/api/members', membersRouter)
app.use('/api/aggregates', aggregatesRouter)
app.use('/api/catalog', catalogRouter)

// Serve static files in production
const distPath = path.join(process.cwd(), 'dist')
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath))
  app.get('{*path}', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`)
})

function shutdown() {
  console.log('[SERVER] Shutting down gracefully...')
  server.close(() => {
    getDb().close()
    console.log('[SERVER] Closed.')
    process.exit(0)
  })
  setTimeout(() => process.exit(1), 10_000)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
