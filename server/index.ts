import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import { ratingsRouter } from './routes/ratings.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = 3001
const DATA_DIR = path.join(__dirname, 'data')
const DATA_FILE = path.join(DATA_DIR, 'ratings.json')

// Auto-create data directory and file if missing
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, '{}', 'utf-8')
}

const app = express()

app.use(cors())
app.use(express.json())

// API routes
app.use('/api/ratings', ratingsRouter)

// Serve static files in production
const distPath = path.join(__dirname, '..', 'dist')
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath))
  app.get('{*path}', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
