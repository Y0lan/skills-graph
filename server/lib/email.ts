import { Resend } from 'resend'
import { marked } from 'marked'
import sanitizeHtml from 'sanitize-html'
import { render } from '@react-email/components'
import { CandidateInvite } from '../emails/candidate-invite.js'
import { CandidateSubmitted } from '../emails/candidate-submitted.js'
import { CandidatureRecue, CandidatureRecueLead } from '../emails/candidature-recue.js'
import { CandidatureRefusee, CandidatureRefuseeLead } from '../emails/candidature-refusee.js'
import { TransitionNotification } from '../emails/transition-notification.js'
import { CustomBodyLayout } from '../emails/custom-body-layout.js'
import { BRAND_LOGO_BUFFER, LOGO_CID } from './brand.js'

const resend = new Resend(process.env.RESEND_API_KEY)

const FROM_EMAIL = 'Radar SINAPSE <radar@sinapse.nc>'

// Inline-image attachment, returned only when the rendered HTML actually
// references the SINAPSE logo via `cid:sinapse-logo`. Templates that do not
// use the branded layout (e.g. CandidateInvite) get no attachment, so emails
// stay slim. See server/lib/brand.ts for why CID and not data:/external URL.
function maybeLogoAttachment(html: string) {
  if (!BRAND_LOGO_BUFFER) return undefined
  if (!html.includes(`cid:${LOGO_CID}`)) return undefined
  return [{
    filename: 'sinapse-logo.png',
    content: BRAND_LOGO_BUFFER,
    contentType: 'image/png',
    contentId: LOGO_CID,
  }]
}

const SANITIZE_OPTIONS = {
  allowedTags: ['p', 'br', 'strong', 'em', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3'],
  allowedAttributes: { a: ['href'] },
}

export async function sendCandidateInvite(opts: {
  to: string
  candidateName: string
  role: string
  evaluationUrl: string
}) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[EMAIL] RESEND_API_KEY not set — skipping email')
    return null
  }

  try {
    const html = await render(CandidateInvite({
      candidateName: opts.candidateName,
      role: opts.role,
      evaluationUrl: encodeURI(opts.evaluationUrl),
    }))

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: opts.to,
      subject: `Évaluation de compétences — ${opts.role} chez SINAPSE`,
      html,
      attachments: maybeLogoAttachment(html),
    })

    if (error) {
      console.error('[EMAIL] Send invitation failed')
      return null
    }

    console.log(`[EMAIL] Invitation sent (id: ${data?.id})`)
    return data
  } catch {
    console.error('[EMAIL] Failed to send invitation')
    return null
  }
}

export async function sendCandidateSubmitted(opts: {
  to: string
  candidateName: string
  role: string
  detailUrl: string
}) {
  if (!process.env.RESEND_API_KEY) return null

  try {
    const html = await render(CandidateSubmitted({
      candidateName: opts.candidateName,
      role: opts.role,
      detailUrl: opts.detailUrl,
    }))

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: opts.to,
      subject: `${opts.candidateName} a soumis son évaluation`,
      html,
      attachments: maybeLogoAttachment(html),
    })

    if (error) {
      console.error('[EMAIL] Send submission notification failed')
      return null
    }

    console.log('[EMAIL] Submission notification sent')
    return data
  } catch {
    console.error('[EMAIL] Failed to send submission notification')
    return null
  }
}

export async function sendApplicationReceived(opts: {
  candidateName: string
  role: string
  candidateEmail: string
  leadEmail: string
}) {
  if (!process.env.RESEND_API_KEY) return null

  // Email to candidate
  try {
    const html = await render(CandidatureRecue({
      candidateName: opts.candidateName,
      role: opts.role,
    }))

    await resend.emails.send({
      from: FROM_EMAIL,
      to: opts.candidateEmail,
      subject: `Candidature reçue — ${opts.role} chez SINAPSE`,
      html,
      attachments: maybeLogoAttachment(html),
    })
    console.log('[EMAIL] Application received sent to candidate')
  } catch {
    console.error('[EMAIL] Failed to send application received (candidate)')
  }

  // Email to lead (+ director if configured)
  const internalRecipients = [opts.leadEmail]
  if (process.env.DIRECTOR_EMAIL) internalRecipients.push(process.env.DIRECTOR_EMAIL)

  try {
    const html = await render(CandidatureRecueLead({
      candidateName: opts.candidateName,
      role: opts.role,
    }))

    await resend.emails.send({
      from: FROM_EMAIL,
      to: internalRecipients,
      subject: `Nouvelle candidature : ${opts.candidateName} — ${opts.role}`,
      html,
      attachments: maybeLogoAttachment(html),
    })
    console.log('[EMAIL] Application received sent to lead')
  } catch {
    console.error('[EMAIL] Failed to send application received (lead)')
  }
}

export async function sendCandidateDeclined(opts: {
  candidateName: string
  role: string
  candidateEmail: string
  leadEmail: string
  reason?: string
  includeReason?: boolean
  skipCandidateEmail?: boolean
}) {
  if (!process.env.RESEND_API_KEY) return null

  // Email to candidate
  if (!opts.skipCandidateEmail) {
    try {
      const html = await render(CandidatureRefusee({
        candidateName: opts.candidateName,
        role: opts.role,
      }))

      await resend.emails.send({
        from: FROM_EMAIL,
        to: opts.candidateEmail,
        subject: `Candidature — ${opts.role} chez SINAPSE`,
        html,
        attachments: maybeLogoAttachment(html),
      })
      console.log('[EMAIL] Decline sent to candidate')
    } catch {
      console.error('[EMAIL] Failed to send decline (candidate)')
    }
  }

  // Email to lead (kept as-is)
  try {
    const html = await render(CandidatureRefuseeLead({
      candidateName: opts.candidateName,
      role: opts.role,
      reason: opts.reason,
      includeReason: opts.includeReason,
    }))

    await resend.emails.send({
      from: FROM_EMAIL,
      to: opts.leadEmail,
      subject: `Candidature refusée : ${opts.candidateName} — ${opts.role}`,
      html,
      attachments: maybeLogoAttachment(html),
    })
    console.log('[EMAIL] Decline confirmation sent to lead')
  } catch {
    console.error('[EMAIL] Failed to send decline (lead)')
  }
}

export async function sendTransitionNotification(opts: {
  to: string
  candidateName: string
  role: string
  statut: string
  notes?: string
}) {
  if (!process.env.RESEND_API_KEY) return null

  let subject: string
  let bodyHtml: string

  switch (opts.statut) {
    case 'preselectionne':
      subject = `Votre candidature a été retenue — ${opts.role}`
      bodyHtml = `Bonne nouvelle ! Votre profil a retenu notre attention pour le poste de <strong>${escapeHtml(opts.role)}</strong>. Nous reviendrons vers vous pour la suite.`
      break
    case 'entretien_1':
    case 'entretien_2':
      subject = `Convocation entretien — ${opts.role}`
      bodyHtml = `Nous souhaitons vous rencontrer pour le poste de <strong>${escapeHtml(opts.role)}</strong>. Un membre de notre équipe vous contactera pour fixer un créneau.`
      break
    case 'proposition':
      subject = `Proposition — ${opts.role} chez SINAPSE`
      bodyHtml = `Nous avons le plaisir de vous informer que nous souhaitons vous faire une proposition pour le poste de <strong>${escapeHtml(opts.role)}</strong>.`
      break
    case 'embauche':
      subject = 'Bienvenue chez SINAPSE ! 🎉'
      bodyHtml = `Félicitations ! Vous rejoignez l'équipe SINAPSE au poste de <strong>${escapeHtml(opts.role)}</strong>. Bienvenue !`
      break
    default:
      return null
  }

  try {
    const html = await render(TransitionNotification({
      candidateName: opts.candidateName,
      role: opts.role,
      statut: opts.statut,
      bodyHtml,
    }))

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: opts.to,
      subject,
      html,
      attachments: maybeLogoAttachment(html),
    })

    if (error) {
      console.error(`[EMAIL] Transition notification (${opts.statut}) send failed`)
      return null
    }

    console.log(`[EMAIL] Transition notification (${opts.statut}) sent (id: ${data?.id})`)
    return data
  } catch {
    console.error(`[EMAIL] Failed to send transition notification (${opts.statut})`)
    return null
  }
}

// ─── Unified email dispatcher ──────────────────────────────────────

export function getEmailTemplate(statut: string, context: {
  candidateName: string
  role: string
  notes?: string
  evaluationUrl?: string
}): { subject: string; body: string } | null {
  const { candidateName, role, evaluationUrl } = context

  switch (statut) {
    case 'skill_radar_envoye':
      return {
        subject: `Évaluation de compétences — ${role} chez SINAPSE`,
        body: `Bonjour ${candidateName} 👋\n\nVous êtes invité(e) à évaluer vos compétences pour le poste de **${role}** chez SINAPSE.\n\nCe questionnaire vous permet d'auto-évaluer vos compétences sur une échelle de 0 (inconnu) à 5 (expert). Soyez honnête — il n'y a pas de mauvaise réponse. Vos réponses sont sauvegardées automatiquement.\n\n[Commencer l'évaluation](${evaluationUrl ? encodeURI(evaluationUrl) : '#'})\n\nCe lien est personnel et expire dans 30 jours. Ne le partagez pas.\nSi vous avez des questions, contactez l'équipe SINAPSE.`,
      }
    case 'refuse':
      return {
        subject: `Candidature — ${role} chez SINAPSE`,
        body: `Bonjour Monsieur/Madame ${candidateName},\n\nNous vous remercions chaleureusement pour l'int\u00e9r\u00eat que vous portez au GIE SINAPSE ainsi que pour votre candidature.\n\nApr\u00e8s avoir examin\u00e9 attentivement votre dossier, nous avons le regret de vous informer que votre profil ne correspond pas \u00e0 nos besoins actuels.\n\nNous vous souhaitons une bonne continuation dans la poursuite de vos recherches.\n\nCordialement,`,
      }
    case 'preselectionne':
      return {
        subject: `Votre candidature a été retenue — ${role}`,
        body: `Bonjour ${candidateName},\n\nBonne nouvelle ! Votre profil a retenu notre attention pour le poste de **${role}**. Nous reviendrons vers vous pour la suite.\n\nCordialement,\nL'équipe SINAPSE`,
      }
    case 'entretien_1':
    case 'entretien_2':
      return {
        subject: `Convocation entretien — ${role}`,
        body: `Bonjour ${candidateName},\n\nNous souhaitons vous rencontrer pour le poste de **${role}**. Un membre de notre équipe vous contactera pour fixer un créneau.\n\nCordialement,\nL'équipe SINAPSE`,
      }
    case 'proposition':
      return {
        subject: `Proposition — ${role} chez SINAPSE`,
        body: `Bonjour ${candidateName},\n\nNous avons le plaisir de vous informer que nous souhaitons vous faire une proposition pour le poste de **${role}**.\n\nCordialement,\nL'équipe SINAPSE`,
      }
    case 'embauche':
      return {
        subject: 'Bienvenue chez SINAPSE ! 🎉',
        body: `Bonjour ${candidateName},\n\nFélicitations ! Vous rejoignez l'équipe SINAPSE au poste de **${role}**. Bienvenue !\n\nCordialement,\nL'équipe SINAPSE`,
      }
    default:
      return null
  }
}

async function buildDefaultHtml(statut: string, context: {
  candidateName: string
  role: string
  notes?: string
  includeReasonInEmail?: boolean
  evaluationUrl?: string
}): Promise<{ subject: string; html: string } | null> {
  const { candidateName, role, evaluationUrl } = context

  if (statut === 'skill_radar_envoye') {
    const html = await render(CandidateInvite({
      candidateName,
      role,
      evaluationUrl: encodeURI(evaluationUrl || ''),
    }))
    return {
      subject: `Évaluation de compétences — ${role} chez SINAPSE`,
      html,
    }
  }

  if (statut === 'refuse') {
    const html = await render(CandidatureRefusee({
      candidateName,
      role,
    }))
    return {
      subject: `Candidature — ${role} chez SINAPSE`,
      html,
    }
  }

  // For other transition statuses, reproduce sendTransitionNotification logic
  let subject: string
  let bodyHtml: string

  switch (statut) {
    case 'preselectionne':
      subject = `Votre candidature a été retenue — ${role}`
      bodyHtml = `Bonne nouvelle ! Votre profil a retenu notre attention pour le poste de <strong>${escapeHtml(role)}</strong>. Nous reviendrons vers vous pour la suite.`
      break
    case 'entretien_1':
    case 'entretien_2':
      subject = `Convocation entretien — ${role}`
      bodyHtml = `Nous souhaitons vous rencontrer pour le poste de <strong>${escapeHtml(role)}</strong>. Un membre de notre équipe vous contactera pour fixer un créneau.`
      break
    case 'proposition':
      subject = `Proposition — ${role} chez SINAPSE`
      bodyHtml = `Nous avons le plaisir de vous informer que nous souhaitons vous faire une proposition pour le poste de <strong>${escapeHtml(role)}</strong>.`
      break
    case 'embauche':
      subject = 'Bienvenue chez SINAPSE ! 🎉'
      bodyHtml = `Félicitations ! Vous rejoignez l'équipe SINAPSE au poste de <strong>${escapeHtml(role)}</strong>. Bienvenue !`
      break
    default:
      return null
  }

  const html = await render(TransitionNotification({
    candidateName,
    role,
    statut,
    bodyHtml,
  }))

  return { subject, html }
}

async function wrapInEmailLayout(htmlContent: string): Promise<string> {
  return await render(CustomBodyLayout({ bodyHtml: htmlContent }))
}

/**
 * Pure renderer for transition emails — no side effects, no Resend call.
 * SHARED by sendTransitionEmail (real send), the /api/recruitment/emails/preview
 * endpoint (Item 16), the /dev/emails inspector route (Item 17), and the
 * AI body wrapper (Item 18). Returns null when the statut has no template.
 */
export async function renderTransitionEmail(opts: {
  candidateName: string
  role: string
  statut: string
  notes?: string
  customBody?: string
  includeReasonInEmail?: boolean
  evaluationUrl?: string
}): Promise<{ subject: string; html: string } | null> {
  if (opts.customBody) {
    const rawHtml = await marked.parse(opts.customBody)
    const cleanHtml = sanitizeHtml(rawHtml, SANITIZE_OPTIONS)
    const html = await wrapInEmailLayout(cleanHtml)
    const template = getEmailTemplate(opts.statut, {
      candidateName: opts.candidateName,
      role: opts.role,
      notes: opts.notes,
      evaluationUrl: opts.evaluationUrl,
    })
    const subject = template?.subject ?? `${opts.role} — SINAPSE`
    return { subject, html }
  }

  const defaultEmail = await buildDefaultHtml(opts.statut, {
    candidateName: opts.candidateName,
    role: opts.role,
    notes: opts.notes,
    includeReasonInEmail: opts.includeReasonInEmail,
    evaluationUrl: opts.evaluationUrl,
  })
  if (!defaultEmail) return null
  return defaultEmail
}

export async function sendTransitionEmail(opts: {
  to: string
  candidateName: string
  role: string
  statut: string
  notes?: string
  customBody?: string
  includeReasonInEmail?: boolean
  evaluationUrl?: string
}): Promise<{ messageId?: string; sent: boolean }> {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[EMAIL] RESEND_API_KEY not set — skipping email')
    return { sent: false }
  }

  const rendered = await renderTransitionEmail(opts)
  if (!rendered) {
    console.warn(`[EMAIL] No template for statut "${opts.statut}" — skipping`)
    return { sent: false }
  }
  const { subject, html } = rendered

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: opts.to,
      subject,
      html,
      attachments: maybeLogoAttachment(html),
    })

    if (error) {
      console.error(`[EMAIL] Transition email (${opts.statut}) send failed`)
      return { sent: false }
    }

    console.log(`[EMAIL] Transition email (${opts.statut}) sent (id: ${data?.id})`)
    return { messageId: data?.id, sent: true }
  } catch {
    console.error(`[EMAIL] Failed to send transition email (${opts.statut})`)
    return { sent: false }
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
