import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

const FROM_EMAIL = 'Radar SINAPSE <radar@sinapse.nc>'

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
            <a href="${opts.evaluationUrl}" style="
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
      console.error('[EMAIL] Resend error:', error)
      return null
    }

    console.log(`[EMAIL] Invitation sent to ${opts.to} (id: ${data?.id})`)
    return data
  } catch (err) {
    console.error('[EMAIL] Failed to send:', err)
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
      console.error('[EMAIL] Resend error:', error)
      return null
    }

    console.log(`[EMAIL] Submission notification sent to ${opts.to}`)
    return data
  } catch (err) {
    console.error('[EMAIL] Failed to send:', err)
    return null
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
