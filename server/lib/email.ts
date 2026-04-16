import { Resend } from 'resend'
import { marked } from 'marked'
import sanitizeHtml from 'sanitize-html'

const resend = new Resend(process.env.RESEND_API_KEY)

const FROM_EMAIL = 'Radar SINAPSE <radar@sinapse.nc>'

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
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: opts.to,
      subject: `Évaluation de compétences — ${opts.role} chez SINAPSE`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
          <h1 style="font-size: 24px; font-weight: 700; color: #1a1a1a; margin-bottom: 8px;">
            Bonjour ${escapeHtml(opts.candidateName)} 👋
          </h1>
          <p style="color: #555; font-size: 16px; line-height: 1.6;">
            Vous êtes invité(e) à évaluer vos compétences pour le poste de
            <strong>${escapeHtml(opts.role)}</strong> chez SINAPSE.
          </p>
          <p style="color: #555; font-size: 14px; line-height: 1.6;">
            Ce questionnaire vous permet d'auto-évaluer vos compétences sur une échelle
            de 0 (inconnu) à 5 (expert). Soyez honnête — il n'y a pas de mauvaise réponse.
            Vos réponses sont sauvegardées automatiquement.
          </p>
          <div style="margin: 32px 0;">
            <a href="${encodeURI(opts.evaluationUrl)}" style="
              display: inline-block;
              background: #2563eb;
              color: white;
              padding: 14px 28px;
              border-radius: 8px;
              text-decoration: none;
              font-weight: 600;
              font-size: 16px;
            ">Commencer l'évaluation</a>
          </div>
          <p style="color: #999; font-size: 12px; line-height: 1.5;">
            Ce lien est personnel et expire dans 30 jours. Ne le partagez pas.<br>
            Si vous avez des questions, contactez l'équipe SINAPSE.
          </p>
        </div>
      `,
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
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: opts.to,
      subject: `${opts.candidateName} a soumis son évaluation`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
          <h1 style="font-size: 24px; font-weight: 700; color: #1a1a1a; margin-bottom: 8px;">
            Évaluation soumise ✅
          </h1>
          <p style="color: #555; font-size: 16px; line-height: 1.6;">
            <strong>${escapeHtml(opts.candidateName)}</strong> a terminé son évaluation
            pour le poste de <strong>${escapeHtml(opts.role)}</strong>.
          </p>
          <div style="margin: 32px 0;">
            <a href="${opts.detailUrl}" style="
              display: inline-block;
              background: #2563eb;
              color: white;
              padding: 14px 28px;
              border-radius: 8px;
              text-decoration: none;
              font-weight: 600;
              font-size: 16px;
            ">Voir les résultats</a>
          </div>
        </div>
      `,
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

  const name = escapeHtml(opts.candidateName)
  const role = escapeHtml(opts.role)

  // Email to candidate
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: opts.candidateEmail,
      subject: `Candidature reçue — ${opts.role} chez SINAPSE`,
      html: wrapInSinapseLayout(`
<p style="margin:0 0 16px 0;">Bonjour ${name},</p>
<p style="margin:0 0 16px 0;">Nous vous remercions vivement pour l'int\u00e9r\u00eat que vous portez au GIE SINAPSE et \u00e0 son projet de refonte des parcours des travailleurs ind\u00e9pendants, des employeurs ainsi que des socles transverses, briques fondamentales du SI CAFAT.</p>
<p style="margin:0 0 16px 0;">Le GIE SINAPSE intervient en tant qu'assistant \u00e0 ma\u00eetrise d'ouvrage pour le compte de la CAFAT sur ce programme structurant, pilier de sa transformation digitale.</p>
<p style="margin:0 0 16px 0;">Afin de garantir un traitement \u00e9quitable et structur\u00e9 des candidatures, celles-ci doivent imp\u00e9rativement \u00eatre d\u00e9pos\u00e9es via notre site internet\u00a0:</p>
<p style="margin:0 0 16px 0;"><a href="https://www.sinapse.nc" style="color:#008272;">https://www.sinapse.nc</a></p>
<p style="margin:0 0 16px 0;">Nous vous invitons \u00e0 compl\u00e9ter l'ensemble du parcours de candidature avec la plus grande attention, en particulier le questionnaire, qui constitue un \u00e9l\u00e9ment d\u00e9terminant dans l'analyse de l'ad\u00e9quation entre votre profil et les enjeux port\u00e9s par SINAPSE.</p>
<p style="margin:0 0 16px 0;">En l'absence de r\u00e9ponse de notre part dans un d\u00e9lai de 15 jours, vous pourrez consid\u00e9rer que nous ne sommes pas en mesure de donner une suite favorable \u00e0 votre candidature.</p>
<p style="margin:0 0 16px 0;">Nous vous remercions pour votre d\u00e9marche et vous souhaitons pleine r\u00e9ussite dans vos projets professionnels.</p>
<p style="margin:0;">Cordialement,</p>
      `),
    })
    console.log('[EMAIL] Application received sent to candidate')
  } catch {
    console.error('[EMAIL] Failed to send application received (candidate)')
  }

  // Email to lead (+ director if configured)
  const internalRecipients = [opts.leadEmail]
  if (process.env.DIRECTOR_EMAIL) internalRecipients.push(process.env.DIRECTOR_EMAIL)

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: internalRecipients,
      subject: `Nouvelle candidature : ${opts.candidateName} — ${opts.role}`,
      html: wrapInSinapseLayout(`
<h1 style="font-size:20px;font-weight:700;color:#1a1a1a;margin:0 0 12px 0;">Nouvelle candidature</h1>
<p style="margin:0 0 12px 0;"><strong>${name}</strong> a postul\u00e9 pour le poste de <strong>${role}</strong>.</p>
<p style="margin:0;">Consultez le pipeline de recrutement pour examiner cette candidature.</p>
      `),
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

  const name = escapeHtml(opts.candidateName)
  const role = escapeHtml(opts.role)

  // Email to candidate
  if (!opts.skipCandidateEmail) {
    try {
      await resend.emails.send({
        from: FROM_EMAIL,
        to: opts.candidateEmail,
        subject: `Candidature — ${opts.role} chez SINAPSE`,
        html: wrapInSinapseLayout(`
<p style="margin:0 0 16px 0;">Bonjour Monsieur/Madame ${name},</p>
<p style="margin:0 0 16px 0;">Nous vous remercions chaleureusement pour l'int\u00e9r\u00eat que vous portez au GIE SINAPSE ainsi que pour votre candidature.</p>
<p style="margin:0 0 16px 0;">Apr\u00e8s avoir examin\u00e9 attentivement votre dossier, nous avons le regret de vous informer que votre profil ne correspond pas \u00e0 nos besoins actuels.</p>
<p style="margin:0 0 16px 0;">Nous vous souhaitons une bonne continuation dans la poursuite de vos recherches.</p>
<p style="margin:0;">Cordialement,</p>
        `),
      })
      console.log('[EMAIL] Decline sent to candidate')
    } catch {
      console.error('[EMAIL] Failed to send decline (candidate)')
    }
  }

  // Email to lead (kept as-is)
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: opts.leadEmail,
      subject: `Candidature refus\u00e9e : ${escapeHtml(opts.candidateName)} — ${escapeHtml(opts.role)}`,
      html: wrapInSinapseLayout(`
<h1 style="font-size:20px;font-weight:700;color:#1a1a1a;margin:0 0 12px 0;">Candidature refus\u00e9e</h1>
<p style="margin:0 0 12px 0;">La candidature de <strong>${name}</strong> pour le poste de <strong>${role}</strong> a \u00e9t\u00e9 refus\u00e9e.</p>
${opts.reason ? `<div style="margin:12px 0;padding:12px 16px;background:#f9fafb;border-radius:8px;border-left:3px solid #d1d5db;"><p style="color:#555;font-size:14px;line-height:1.6;margin:0;"><strong>Motif\u00a0:</strong> ${escapeHtml(opts.reason)}</p></div>` : ''}
<p style="color:#999;font-size:12px;line-height:1.5;margin:0;">${opts.includeReason ? 'Le motif a \u00e9t\u00e9 communiqu\u00e9 au candidat.' : 'Le motif n\'a pas \u00e9t\u00e9 communiqu\u00e9 au candidat.'}</p>
      `),
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
  let body: string

  switch (opts.statut) {
    case 'preselectionne':
      subject = `Votre candidature a été retenue — ${opts.role}`
      body = `Bonne nouvelle ! Votre profil a retenu notre attention pour le poste de <strong>${escapeHtml(opts.role)}</strong>. Nous reviendrons vers vous pour la suite.`
      break
    case 'entretien_1':
    case 'entretien_2':
      subject = `Convocation entretien — ${opts.role}`
      body = `Nous souhaitons vous rencontrer pour le poste de <strong>${escapeHtml(opts.role)}</strong>. Un membre de notre équipe vous contactera pour fixer un créneau.`
      break
    case 'proposition':
      subject = `Proposition — ${opts.role} chez SINAPSE`
      body = `Nous avons le plaisir de vous informer que nous souhaitons vous faire une proposition pour le poste de <strong>${escapeHtml(opts.role)}</strong>.`
      break
    case 'embauche':
      subject = 'Bienvenue chez SINAPSE ! 🎉'
      body = `Félicitations ! Vous rejoignez l'équipe SINAPSE au poste de <strong>${escapeHtml(opts.role)}</strong>. Bienvenue !`
      break
    default:
      return null
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: opts.to,
      subject,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
          <h1 style="font-size: 24px; font-weight: 700; color: #1a1a1a; margin-bottom: 8px;">
            Bonjour ${escapeHtml(opts.candidateName)},
          </h1>
          <p style="color: #555; font-size: 16px; line-height: 1.6;">
            ${body}
          </p>
          <p style="color: #555; font-size: 14px; line-height: 1.6; margin-top: 24px;">
            Cordialement,<br>
            L'équipe SINAPSE
          </p>
          <p style="color: #999; font-size: 12px; line-height: 1.5; margin-top: 32px;">
            Cet email est envoyé automatiquement — merci de ne pas y répondre.<br>
            Si vous avez des questions, contactez l'équipe SINAPSE.
          </p>
        </div>
      `,
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

function wrapInEmailLayout(htmlContent: string): string {
  return wrapInSinapseLayout(htmlContent)
}

function wrapInSinapseLayout(content: string): string {
  return `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:8px;">
<tr><td style="padding:40px 32px 24px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1a1a1a;font-size:15px;line-height:1.7;">
${content}
</td></tr>
<tr><td style="padding:0 32px 32px 32px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="border-left:2px solid #008272;padding:16px 0 16px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<p style="margin:0 0 4px 0;font-size:14px;color:#1a1a1a;"><strong>Team</strong> &mdash; GIE SINAPSE</p>
<p style="margin:0 0 12px 0;font-size:12px;color:#666;font-style:italic;">Du code et du sens &middot; Transformation num\u00e9rique de la protection sociale de Nouvelle Cal\u00e9donie</p>
<p style="margin:0 0 4px 0;font-size:12px;color:#666;"><a href="https://www.sinapse.nc" style="color:#008272;text-decoration:none;">www.sinapse.nc</a> &middot; <a href="https://www.linkedin.com/company/sinapse-nc/" style="color:#008272;text-decoration:none;">LinkedIn</a></p>
<p style="margin:0;font-size:11px;color:#999;">BP L5 98849 NOUMEA CEDEX, Nouvelle-Cal\u00e9donie</p>
</td></tr>
</table>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}

function buildDefaultHtml(statut: string, context: {
  candidateName: string
  role: string
  notes?: string
  includeReasonInEmail?: boolean
  evaluationUrl?: string
}): { subject: string; html: string } | null {
  const { candidateName, role, evaluationUrl } = context

  if (statut === 'skill_radar_envoye') {
    // Reproduce the exact existing sendCandidateInvite HTML
    return {
      subject: `Évaluation de compétences — ${role} chez SINAPSE`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
          <h1 style="font-size: 24px; font-weight: 700; color: #1a1a1a; margin-bottom: 8px;">
            Bonjour ${escapeHtml(candidateName)} 👋
          </h1>
          <p style="color: #555; font-size: 16px; line-height: 1.6;">
            Vous êtes invité(e) à évaluer vos compétences pour le poste de
            <strong>${escapeHtml(role)}</strong> chez SINAPSE.
          </p>
          <p style="color: #555; font-size: 14px; line-height: 1.6;">
            Ce questionnaire vous permet d'auto-évaluer vos compétences sur une échelle
            de 0 (inconnu) à 5 (expert). Soyez honnête — il n'y a pas de mauvaise réponse.
            Vos réponses sont sauvegardées automatiquement.
          </p>
          <div style="margin: 32px 0;">
            <a href="${encodeURI(evaluationUrl || '')}" style="
              display: inline-block;
              background: #2563eb;
              color: white;
              padding: 14px 28px;
              border-radius: 8px;
              text-decoration: none;
              font-weight: 600;
              font-size: 16px;
            ">Commencer l'évaluation</a>
          </div>
          <p style="color: #999; font-size: 12px; line-height: 1.5;">
            Ce lien est personnel et expire dans 30 jours. Ne le partagez pas.<br>
            Si vous avez des questions, contactez l'équipe SINAPSE.
          </p>
        </div>
      `,
    }
  }

  if (statut === 'refuse') {
    return {
      subject: `Candidature — ${role} chez SINAPSE`,
      html: wrapInSinapseLayout(`
<p style="margin:0 0 16px 0;">Bonjour Monsieur/Madame ${escapeHtml(candidateName)},</p>
<p style="margin:0 0 16px 0;">Nous vous remercions chaleureusement pour l'int\u00e9r\u00eat que vous portez au GIE SINAPSE ainsi que pour votre candidature.</p>
<p style="margin:0 0 16px 0;">Apr\u00e8s avoir examin\u00e9 attentivement votre dossier, nous avons le regret de vous informer que votre profil ne correspond pas \u00e0 nos besoins actuels.</p>
<p style="margin:0 0 16px 0;">Nous vous souhaitons une bonne continuation dans la poursuite de vos recherches.</p>
<p style="margin:0;">Cordialement,</p>
      `),
    }
  }

  // For other transition statuses, reproduce sendTransitionNotification logic
  let subject: string
  let body: string

  switch (statut) {
    case 'preselectionne':
      subject = `Votre candidature a été retenue — ${role}`
      body = `Bonne nouvelle ! Votre profil a retenu notre attention pour le poste de <strong>${escapeHtml(role)}</strong>. Nous reviendrons vers vous pour la suite.`
      break
    case 'entretien_1':
    case 'entretien_2':
      subject = `Convocation entretien — ${role}`
      body = `Nous souhaitons vous rencontrer pour le poste de <strong>${escapeHtml(role)}</strong>. Un membre de notre équipe vous contactera pour fixer un créneau.`
      break
    case 'proposition':
      subject = `Proposition — ${role} chez SINAPSE`
      body = `Nous avons le plaisir de vous informer que nous souhaitons vous faire une proposition pour le poste de <strong>${escapeHtml(role)}</strong>.`
      break
    case 'embauche':
      subject = 'Bienvenue chez SINAPSE ! 🎉'
      body = `Félicitations ! Vous rejoignez l'équipe SINAPSE au poste de <strong>${escapeHtml(role)}</strong>. Bienvenue !`
      break
    default:
      return null
  }

  return {
    subject,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 24px; font-weight: 700; color: #1a1a1a; margin-bottom: 8px;">
          Bonjour ${escapeHtml(candidateName)},
        </h1>
        <p style="color: #555; font-size: 16px; line-height: 1.6;">
          ${body}
        </p>
        <p style="color: #555; font-size: 14px; line-height: 1.6; margin-top: 24px;">
          Cordialement,<br>
          L'équipe SINAPSE
        </p>
        <p style="color: #999; font-size: 12px; line-height: 1.5; margin-top: 32px;">
          Cet email est envoyé automatiquement — merci de ne pas y répondre.<br>
          Si vous avez des questions, contactez l'équipe SINAPSE.
        </p>
      </div>
    `,
  }
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

  let subject: string
  let html: string

  if (opts.customBody) {
    // Use custom body: markdown → HTML → sanitize, wrapped in email layout
    const rawHtml = await marked.parse(opts.customBody)
    const cleanHtml = sanitizeHtml(rawHtml, SANITIZE_OPTIONS)
    html = wrapInEmailLayout(cleanHtml)

    // Still need a subject — get it from the template
    const template = getEmailTemplate(opts.statut, {
      candidateName: opts.candidateName,
      role: opts.role,
      notes: opts.notes,
      evaluationUrl: opts.evaluationUrl,
    })
    subject = template?.subject ?? `${opts.role} — SINAPSE`
  } else {
    // Use default template (identical to existing behavior)
    const defaultEmail = buildDefaultHtml(opts.statut, {
      candidateName: opts.candidateName,
      role: opts.role,
      notes: opts.notes,
      includeReasonInEmail: opts.includeReasonInEmail,
      evaluationUrl: opts.evaluationUrl,
    })

    if (!defaultEmail) {
      console.warn(`[EMAIL] No template for statut "${opts.statut}" — skipping`)
      return { sent: false }
    }

    subject = defaultEmail.subject
    html = defaultEmail.html
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: opts.to,
      subject,
      html,
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
