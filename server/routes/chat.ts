import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { requireAuth } from '../middleware/require-auth.js'
import { computeMemberAggregate, computeTeamAggregate } from '../lib/aggregates.js'
import { getSkillCategories } from '../lib/catalog.js'
import { getAllEvaluations } from '../lib/db.js'
import { getDb } from '../lib/db.js'
import { getUser } from '../lib/types.js'

const DAILY_LIMIT = 20

const SYSTEM_BASE = `Tu es un coach compétences intégré à un outil d'équipe IT. Tu parles comme un collègue bienveillant, pas un consultant.

Règles strictes :
- Français uniquement, tutoie l'utilisateur
- Réponses COURTES : 2-4 phrases par point, 150 mots max sauf demande explicite de détail
- Va droit au but. Jamais d'intro bateau ("Bien sûr !", "Excellente question !")
- Propose des actions concrètes : formation précise, mentorat avec un collègue de l'équipe, mise en situation projet
- Ne cite pas de scores bruts sauf demande explicite
- Markdown léger : **gras** et listes à puces uniquement. Jamais de titres (#, ##, ###). Pas d'émoji.
- Quand tu mentionnes un membre de l'équipe, utilise son prénom`

/** Build skill-level detail block for a member's ratings.
 *  Ratings are cumulative: level 3 means the person can do everything described
 *  at levels 1, 2, and 3, but NOT what's described at levels 4 and 5. */
function buildSkillDetail(ratings: Record<string, number>): string {
  const cats = getSkillCategories()
  const lines: string[] = []
  for (const cat of cats) {
    const skills = cat.skills
      .map(s => {
        const val = ratings[s.id]
        if (val === undefined || val <= 0) return null
        const descriptors = s.descriptors ?? []
        const acquired = descriptors
          .filter(d => d.level >= 1 && d.level <= val)
          .sort((a, b) => a.level - b.level)
          .map(d => d.description)
        const notYet = descriptors
          .filter(d => d.level > val && d.level <= 5)
          .sort((a, b) => a.level - b.level)
          .map(d => d.description)
        let detail = `  · ${s.label} : ${val}/5`
        if (acquired.length > 0) detail += `\n      Sait faire : ${acquired.join(' ; ')}`
        if (notYet.length > 0) detail += `\n      Ne sait pas encore : ${notYet.join(' ; ')}`
        return detail
      })
      .filter(Boolean)
    if (skills.length > 0) {
      lines.push(`${cat.label} :`)
      lines.push(...(skills as string[]))
    }
  }
  return lines.join('\n')
}

export const chatRouter = Router()

chatRouter.post('/', requireAuth, async (req, res) => {
  const user = getUser(req)
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

  // Build context from aggregate data
  // Support both new slugs[] format and legacy slug/compareSlug format
  let contextSlugs: string[] = []
  if (Array.isArray(context?.slugs)) {
    contextSlugs = context.slugs.filter((s: unknown) => typeof s === 'string')
  } else {
    // Legacy format fallback
    if (context?.slug && typeof context.slug === 'string') contextSlugs.push(context.slug)
    if (context?.compareSlug && typeof context.compareSlug === 'string') contextSlugs.push(context.compareSlug)
  }

  if (contextSlugs.length > 15) {
    res.status(400).json({ error: 'Trop de profils en contexte (max 15)' })
    return
  }

  const allRatings = getAllEvaluations()

  let contextBlock = ''
  if (contextSlugs.length === 0) {
    // Global context — team aggregate + every member's skill-level data
    const team = computeTeamAggregate()
    if (team && team.submittedCount > 0) {
      contextBlock = `\n\nContexte global de l'équipe (${team.submittedCount}/${team.teamSize} évaluations) :\n`
      contextBlock += team.categories.map(c =>
        `- ${c.categoryLabel} : moyenne ${c.teamAvgRank.toFixed(1)}/5`
      ).join('\n')

      // Add every submitted member's skill-level detail
      for (const m of team.members) {
        if (!m.submittedAt) continue
        const memberRatings = allRatings[m.slug]?.ratings
        if (!memberRatings) continue
        contextBlock += `\n\n── ${m.name} (${m.role}) ──\n`
        contextBlock += buildSkillDetail(memberRatings)
      }
    }
  } else {
    for (const s of contextSlugs) {
      const agg = computeMemberAggregate(s)
      if (!agg) continue
      contextBlock += `\n\nProfil : ${agg.memberName} (${agg.role})\nCatégories :\n${agg.categories.map(c =>
        `- ${c.categoryLabel} : ${c.avgRank.toFixed(1)}/5 (cible: ${c.targetRank}, écart: ${c.gap > 0 ? `-${c.gap.toFixed(1)}` : 'OK'})`
      ).join('\n')}`

      // Skill-level detail
      const memberRatings = allRatings[s]?.ratings
      if (memberRatings) {
        contextBlock += `\nDétail des compétences :\n${buildSkillDetail(memberRatings)}`
      }

      if (agg.profileSummary) contextBlock += `\nSynthèse IA : ${agg.profileSummary}`
    }
  }

  console.log('[CHAT] Context: %d profiles, prompt ~%d chars', contextSlugs.length, SYSTEM_BASE.length + contextBlock.length)

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
      max_tokens: 512,
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

// GET /remaining — check remaining daily quota + next reset time
chatRouter.get('/remaining', requireAuth, (req, res) => {
  const user = getUser(req)
  const db = getDb()
  const count = db.prepare(
    "SELECT COUNT(*) as cnt FROM chat_usage WHERE user_id = ? AND used_at > datetime('now', '-1 day')"
  ).get(user.id) as { cnt: number }

  // Find oldest usage in the 24h window — that's when the next slot frees up
  let resetsAt: string | null = null
  if (count.cnt >= DAILY_LIMIT) {
    const oldest = db.prepare(
      "SELECT used_at FROM chat_usage WHERE user_id = ? AND used_at > datetime('now', '-1 day') ORDER BY used_at ASC LIMIT 1"
    ).get(user.id) as { used_at: string } | undefined
    if (oldest) {
      // oldest.used_at is UTC, add 24h to get when it expires
      const resetDate = new Date(oldest.used_at + 'Z')
      resetDate.setHours(resetDate.getHours() + 24)
      resetsAt = resetDate.toISOString()
    }
  }

  res.json({ remaining: DAILY_LIMIT - count.cnt, limit: DAILY_LIMIT, resetsAt })
})
