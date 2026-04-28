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

/**
 * Compact skill summary for a single member: top-N strongest skills (level ≥ 4)
 * + top-M weakest evaluated skills (level ≤ 1, non-skipped). Used for the
 * "global team" context where we'd otherwise blow the token budget by
 * emitting every catalog skill × every member with descriptors.
 *
 * Demo-day fix: a 10-member team × 178 catalog skills × ~150 chars/skill
 * was producing ~250 KB of system prompt, which Anthropic rejected with
 * a context-length error that the original code swallowed as a generic
 * "Erreur lors de la génération". See plan §Item 1.
 */
export function buildCompactSkillSummary(ratings: Record<string, number>, topN = 5, bottomM = 3): string {
  const entries = Object.entries(ratings).filter(([, v]) => typeof v === 'number')
  if (entries.length === 0) return '  (pas d\'évaluations)'
  const cats = getSkillCategories()
  const labelById = new Map<string, string>()
  for (const c of cats) for (const s of c.skills) labelById.set(s.id, s.label)
  const labelOf = (id: string) => labelById.get(id) ?? id
  const top = entries
    .filter(([, v]) => v >= 4)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([id, v]) => `${labelOf(id)} ${v}/5`)
  const bottom = entries
    .filter(([, v]) => v >= 0 && v <= 1)
    .sort((a, b) => a[1] - b[1])
    .slice(0, bottomM)
    .map(([id, v]) => `${labelOf(id)} ${v}/5`)
  const parts: string[] = []
  if (top.length > 0) parts.push(`  Forces : ${top.join(', ')}`)
  if (bottom.length > 0) parts.push(`  À renforcer : ${bottom.join(', ')}`)
  return parts.length > 0 ? parts.join('\n') : '  (pas d\'extrêmes notables)'
}

/**
 * Map an Anthropic SDK error to a French user-facing message.
 *
 * Diagnose-first principle (codex P3): we surface the actual error class
 * instead of swallowing every failure as "Erreur lors de la génération".
 * This way Yolan/Guillaume see WHY the chatbot failed (rate limit vs
 * context length vs auth vs something else) and the server log retains
 * the raw error for debugging.
 */
export function mapAnthropicError(err: unknown): string {
  // Anthropic SDK errors carry status + error.type. We type-narrow defensively
  // because the runtime shape can vary across SDK versions and middleware.
  const e = err as {
    status?: number
    error?: { error?: { type?: string; message?: string }; type?: string }
    type?: string
    message?: string
  }
  const status = e?.status
  const type =
    e?.error?.error?.type ??
    e?.error?.type ??
    e?.type
  if (status === 429 || type === 'rate_limit_error') {
    return 'L\'IA est temporairement surchargée. Réessaie dans une minute.'
  }
  if (type === 'context_length_exceeded' || /context.*length|too.*long/i.test(e?.message ?? '')) {
    return 'Contexte trop large — sélectionne quelques membres au lieu de toute l\'équipe.'
  }
  if (status === 401 || type === 'authentication_error') {
    return 'Configuration IA invalide. Préviens un admin.'
  }
  if (status === 400 || type === 'invalid_request_error') {
    return 'Requête invalide. Détails dans les logs serveur.'
  }
  if (status === 529 || type === 'overloaded_error') {
    return 'L\'IA est temporairement surchargée. Réessaie dans une minute.'
  }
  return 'Erreur lors de la génération. Détails dans les logs serveur.'
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
  let contextDowngraded = false
  if (contextSlugs.length === 0) {
    // Global context — team aggregate + every member's skill summary.
    //
    // Demo bug (April 2026): the original code emitted the full
    // descriptor-rich detail for every submitted member × all 178
    // catalog skills, producing ~250 KB of system prompt for a 10-member
    // team. Anthropic rejected with context_length_exceeded and the
    // user saw a generic "Erreur lors de la génération".
    //
    // Now we emit a compact "top strengths + weak spots" summary per
    // member. The full descriptor-rich detail is reserved for the
    // single-member context where the budget genuinely fits. See plan
    // §Item 1.
    const team = computeTeamAggregate()
    if (team && team.submittedCount > 0) {
      contextBlock = `\n\nContexte global de l'équipe (${team.submittedCount}/${team.teamSize} évaluations) :\n`
      contextBlock += team.categories.map(c =>
        `- ${c.categoryLabel} : moyenne ${c.teamAvgRank.toFixed(1)}/5`
      ).join('\n')

      for (const m of team.members) {
        if (!m.submittedAt) continue
        const memberRatings = allRatings[m.slug]?.ratings
        if (!memberRatings) continue
        contextBlock += `\n\n── ${m.name} (${m.role}) ──\n`
        contextBlock += buildCompactSkillSummary(memberRatings)
      }

      // Pre-flight token estimate (~3 chars/token for French). If even
      // the compact summary blows past 150 K input tokens (a 30+ member
      // team), drop to aggregate-only and flag the downgrade in the
      // response so the UI can render a hint.
      const TOKEN_BUDGET = 150_000
      const estimatedTokens = (SYSTEM_BASE.length + contextBlock.length) / 3
      if (estimatedTokens > TOKEN_BUDGET) {
        contextDowngraded = true
        contextBlock = `\n\nContexte global de l'équipe (${team.submittedCount}/${team.teamSize} évaluations) :\n`
        contextBlock += team.categories.map(c =>
          `- ${c.categoryLabel} : moyenne ${c.teamAvgRank.toFixed(1)}/5`
        ).join('\n')
        contextBlock += '\n\n(Détails par membre omis — équipe trop large pour le budget contexte.)'
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

  console.log('[CHAT] Context: %d profiles, prompt ~%d chars, downgraded=%s', contextSlugs.length, SYSTEM_BASE.length + contextBlock.length, contextDowngraded)

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
    // contextDowngraded is metadata (codex P4: hidden state in generated
    // text would be bad UX). The frontend can render a small hint badge
    // when this flag is true.
    res.write(`data: ${JSON.stringify({ done: true, remaining, contextDowngraded })}\n\n`)
    res.end()
  } catch (err) {
    // Log the raw error so we have ground truth on every failure (was
    // previously swallowed). The user-facing message is mapped via
    // mapAnthropicError to surface the actual cause (rate limit /
    // context length / auth / …) instead of a generic catch-all.
    console.error('[CHAT] Stream error:', err)
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ error: mapAnthropicError(err) })}\n\n`)
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
