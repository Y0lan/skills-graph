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

export async function sendApplicationReceived(opts: {
  candidateName: string
  role: string
  candidateEmail: string
  leadEmail: string
}) {
  if (!process.env.RESEND_API_KEY) return null

  // Email to candidate
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: opts.candidateEmail,
      subject: `Candidature reçue — ${opts.role} chez SINAPSE`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
          <h1 style="font-size: 24px; font-weight: 700; color: #1a1a1a; margin-bottom: 8px;">
            Bonjour ${escapeHtml(opts.candidateName)} 👋
          </h1>
          <p style="color: #555; font-size: 16px; line-height: 1.6;">
            Nous avons bien reçu votre candidature pour le poste de
            <strong>${escapeHtml(opts.role)}</strong> chez SINAPSE.
          </p>
          <p style="color: #555; font-size: 14px; line-height: 1.6;">
            Notre équipe va examiner votre dossier et reviendra vers vous rapidement.
            Merci pour votre intérêt !
          </p>
          <p style="color: #999; font-size: 12px; line-height: 1.5; margin-top: 32px;">
            Cet email est envoyé automatiquement — merci de ne pas y répondre.<br>
            Si vous avez des questions, contactez l'équipe SINAPSE.
          </p>
        </div>
      `,
    })
    console.log(`[EMAIL] Application received sent to candidate ${opts.candidateEmail}`)
  } catch (err) {
    console.error('[EMAIL] Failed to send application received (candidate):', err)
  }

  // Email to lead
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: opts.leadEmail,
      subject: `Nouvelle candidature : ${opts.candidateName} — ${opts.role}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
          <h1 style="font-size: 24px; font-weight: 700; color: #1a1a1a; margin-bottom: 8px;">
            Nouvelle candidature 📩
          </h1>
          <p style="color: #555; font-size: 16px; line-height: 1.6;">
            <strong>${escapeHtml(opts.candidateName)}</strong> a postulé pour le poste de
            <strong>${escapeHtml(opts.role)}</strong>.
          </p>
          <p style="color: #555; font-size: 14px; line-height: 1.6;">
            Consultez le pipeline de recrutement pour examiner cette candidature.
          </p>
        </div>
      `,
    })
    console.log(`[EMAIL] Application received sent to lead ${opts.leadEmail}`)
  } catch (err) {
    console.error('[EMAIL] Failed to send application received (lead):', err)
  }
}

export async function sendCandidateDeclined(opts: {
  candidateName: string
  role: string
  candidateEmail: string
  leadEmail: string
  reason?: string
  includeReason?: boolean
}) {
  if (!process.env.RESEND_API_KEY) return null

  // Email to candidate
  const reasonBlock = opts.includeReason && opts.reason
    ? `
      <div style="margin: 20px 0; padding: 16px; background: #f9fafb; border-radius: 8px; border-left: 3px solid #d1d5db;">
        <p style="color: #555; font-size: 14px; line-height: 1.6; margin: 0;">
          ${escapeHtml(opts.reason)}
        </p>
      </div>
    `
    : ''

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: opts.candidateEmail,
      subject: `Votre candidature — ${opts.role} chez SINAPSE`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
          <h1 style="font-size: 24px; font-weight: 700; color: #1a1a1a; margin-bottom: 8px;">
            Bonjour ${escapeHtml(opts.candidateName)},
          </h1>
          <p style="color: #555; font-size: 16px; line-height: 1.6;">
            Nous avons étudié avec attention votre candidature pour le poste de
            <strong>${escapeHtml(opts.role)}</strong> et nous avons décidé de ne pas
            poursuivre le processus.
          </p>
          ${reasonBlock}
          <p style="color: #555; font-size: 14px; line-height: 1.6;">
            Nous vous remercions pour le temps consacré et vous souhaitons
            le meilleur dans la suite de vos démarches.
          </p>
          <p style="color: #555; font-size: 14px; line-height: 1.6;">
            Cordialement,<br>
            L'équipe SINAPSE
          </p>
        </div>
      `,
    })
    console.log(`[EMAIL] Decline sent to candidate ${opts.candidateEmail}`)
  } catch (err) {
    console.error('[EMAIL] Failed to send decline (candidate):', err)
  }

  // Email to lead
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: opts.leadEmail,
      subject: `Candidature refusée : ${opts.candidateName} — ${opts.role}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
          <h1 style="font-size: 24px; font-weight: 700; color: #1a1a1a; margin-bottom: 8px;">
            Candidature refusée
          </h1>
          <p style="color: #555; font-size: 16px; line-height: 1.6;">
            La candidature de <strong>${escapeHtml(opts.candidateName)}</strong> pour le poste de
            <strong>${escapeHtml(opts.role)}</strong> a été refusée.
          </p>
          ${opts.reason ? `
            <div style="margin: 20px 0; padding: 16px; background: #f9fafb; border-radius: 8px; border-left: 3px solid #d1d5db;">
              <p style="color: #555; font-size: 14px; line-height: 1.6; margin: 0;">
                <strong>Motif :</strong> ${escapeHtml(opts.reason)}
              </p>
            </div>
          ` : ''}
          <p style="color: #999; font-size: 12px; line-height: 1.5;">
            ${opts.includeReason ? 'Le motif a été communiqué au candidat.' : 'Le motif n\'a pas été communiqué au candidat.'}
          </p>
        </div>
      `,
    })
    console.log(`[EMAIL] Decline confirmation sent to lead ${opts.leadEmail}`)
  } catch (err) {
    console.error('[EMAIL] Failed to send decline (lead):', err)
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
      console.error('[EMAIL] Resend error:', error)
      return null
    }

    console.log(`[EMAIL] Transition notification (${opts.statut}) sent to ${opts.to} (id: ${data?.id})`)
    return data
  } catch (err) {
    console.error('[EMAIL] Failed to send transition notification:', err)
    return null
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
