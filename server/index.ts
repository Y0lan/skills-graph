import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import { fromNodeHeaders, toNodeHandler } from 'better-auth/node'
import { ratingsRouter } from './routes/ratings.js'
import { categoriesRouter } from './routes/categories.js'
import { membersRouter } from './routes/members.js'
import { aggregatesRouter } from './routes/aggregates.js'
import { catalogRouter } from './routes/catalog.js'
import { initDatabase } from './lib/db.js'
import { createAuth, lastSentAt, COOLDOWN_MS } from './lib/auth.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
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

// Magic link endpoint — bypass toNodeHandler for better error visibility
app.post('/api/auth/sign-in/magic-link', express.json(), async (req, res) => {
  const email = req.body.email
  if (!email) {
    return res.status(400).json({ message: 'Email requis' })
  }

  // Cooldown check — return 429 instead of letting it become a 500
  const now = Date.now()
  const last = lastSentAt.get(email)
  if (last && now - last < COOLDOWN_MS) {
    const wait = Math.ceil((COOLDOWN_MS - (now - last)) / 1000)
    return res.status(429).json({ message: `Veuillez patienter ${wait}s avant de renvoyer un lien` })
  }

  try {
    const result = await auth.api.signInMagicLink({
      body: { email, callbackURL: req.body.callbackURL },
      headers: fromNodeHeaders(req.headers),
    })
    lastSentAt.set(email, now) // Only set cooldown after successful send
    res.json(result)
  } catch (err: any) {
    console.error('[AUTH] Magic link error:', err)
    const status = err?.statusCode ?? 500
    res.status(status).json({ message: err?.message ?? 'Internal auth error' })
  }
})

// Dev-only: reset magic link cooldown
if (process.env.NODE_ENV !== 'production') {
  app.delete('/api/auth/cooldown', (_req, res) => {
    lastSentAt.clear()
    res.json({ message: 'Cooldown reset' })
  })
}

// Better Auth handler for all other auth routes — BEFORE express.json()
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

// API routes
app.use('/api/ratings', ratingsRouter)
app.use('/api/categories', categoriesRouter)
app.use('/api/members', membersRouter)
app.use('/api/aggregates', aggregatesRouter)
app.use('/api/catalog', catalogRouter)

// Serve static files in production
const distPath = path.join(__dirname, '..', 'dist')
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath))
  app.get('{*path}', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`)
})
