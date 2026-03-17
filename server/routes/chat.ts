import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { requireAuth } from '../middleware/require-auth.js'
import { computeMemberAggregate } from '../lib/aggregates.js'
import { getDb } from '../lib/db.js'

interface AuthUser {
  id: string
  slug: string | null
  [key: string]: unknown
}

const DAILY_LIMIT = 20

const SYSTEM_BASE = `Tu es un assistant spécialisé dans l'analyse de compétences IT pour une équipe technique. Tu as accès aux données d'évaluation des membres de l'équipe.

Règles :
- Réponds en français
- Sois concis et actionnable
- Ne cite pas de scores bruts sauf si on te le demande explicitement
- Propose des pistes concrètes (formation, mentorat, mise en situation)
- Ton professionnel et bienveillant`

export const chatRouter = Router()

chatRouter.post('/', requireAuth, async (req, res) => {
  const user = (req as typeof req & { user: AuthUser }).user
  const { messages, context } = req.body

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'Messages requis' })
    return
  }

  // Validate and sanitize messages (prevent role injection + unbounded payload)
  if (messages.length > 50) {
    res.status(400).json({ error: 'Trop de messages (max 50)' })
    return
  }

  const validatedMessages: { role: 'user' | 'assistant'; content: string }[] = []
  for (const m of messages) {
    if (typeof m !== 'object' || m === null) {
      res.status(400).json({ error: 'Message invalide' })
      return
    }
    if (m.role !== 'user' && m.role !== 'assistant') {
      res.status(400).json({ error: 'Rôle de message invalide' })
      return
    }
    if (typeof m.content !== 'string' || m.content.length === 0 || m.content.length > 10_000) {
      res.status(400).json({ error: 'Contenu de message invalide (max 10 000 caractères)' })
      return
    }
    validatedMessages.push({ role: m.role, content: m.content })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    res.status(503).json({ error: 'Service IA indisponible' })
    return
  }

  // Rate limit check
  const db = getDb()
  const count = db.prepare(
    "SELECT COUNT(*) as cnt FROM chat_usage WHERE user_id = ? AND used_at > datetime('now', '-1 day')"
  ).get(user.id) as { cnt: number }

  if (count.cnt >= DAILY_LIMIT) {
    res.status(429).json({ error: 'Limite quotidienne atteinte (20 questions/jour)', remaining: 0 })
    return
  }

  // Build context from aggregate data (validate slug types)
  let contextBlock = ''
  if (context?.slug && typeof context.slug === 'string') {
    const agg = computeMemberAggregate(context.slug)
    if (agg) {
      contextBlock += `\n\nProfil consulté : ${agg.memberName} (${agg.role})\nCatégories :\n${agg.categories.map(c =>
        `- ${c.categoryLabel} : ${c.avgRank.toFixed(1)}/5 (cible: ${c.targetRank}, écart: ${c.gap > 0 ? `-${c.gap.toFixed(1)}` : 'OK'})`
      ).join('\n')}`
      if (agg.profileSummary) contextBlock += `\n\nSynthèse IA : ${agg.profileSummary}`
    }
  }
  if (context?.compareSlug && typeof context.compareSlug === 'string') {
    const agg2 = computeMemberAggregate(context.compareSlug)
    if (agg2) {
      contextBlock += `\n\nProfil comparé : ${agg2.memberName} (${agg2.role})\nCatégories :\n${agg2.categories.map(c =>
        `- ${c.categoryLabel} : ${c.avgRank.toFixed(1)}/5 (cible: ${c.targetRank}, écart: ${c.gap > 0 ? `-${c.gap.toFixed(1)}` : 'OK'})`
      ).join('\n')}`
    }
  }

  const systemPrompt = SYSTEM_BASE + contextBlock

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  try {
    const client = new Anthropic({ apiKey, timeout: 60_000 })

    const stream = client.messages.stream({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      temperature: 0.7,
      system: systemPrompt,
      messages: validatedMessages,
    })

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`)
      }
    }

    // Record usage after successful completion
    db.prepare('INSERT INTO chat_usage (user_id) VALUES (?)').run(user.id)

    const remaining = DAILY_LIMIT - count.cnt - 1
    res.write(`data: ${JSON.stringify({ done: true, remaining })}\n\n`)
    res.end()
  } catch (err) {
    console.error('[CHAT] Stream error:', err)
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ error: 'Erreur lors de la génération' })}\n\n`)
      res.end()
    }
  }
})

// GET /remaining — check remaining daily quota
chatRouter.get('/remaining', requireAuth, (req, res) => {
  const user = (req as typeof req & { user: AuthUser }).user
  const count = getDb().prepare(
    "SELECT COUNT(*) as cnt FROM chat_usage WHERE user_id = ? AND used_at > datetime('now', '-1 day')"
  ).get(user.id) as { cnt: number }
  res.json({ remaining: DAILY_LIMIT - count.cnt })
})
