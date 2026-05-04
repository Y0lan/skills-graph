
interface CandidateInviteProps {
  candidateName: string
  role: string
  evaluationUrl: string
}

/** Skill-radar evaluation invite sent to the candidate */
export function CandidateInvite({
  candidateName,
  role,
  evaluationUrl,
}: CandidateInviteProps) {
  return (
    <div
      style={{
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        maxWidth: '560px',
        margin: '0 auto',
        padding: '40px 20px',
      }}
    >
      <h1
        style={{
          fontSize: '24px',
          fontWeight: 700,
          color: '#1a1a1a',
          marginBottom: '8px',
        }}
      >
        Bonjour {candidateName} {'\u{1F44B}'}
      </h1>
      <p style={{ color: '#555', fontSize: '16px', lineHeight: '1.6' }}>
        Vous &ecirc;tes invit&eacute;(e) &agrave; &eacute;valuer vos
        comp&eacute;tences pour le poste de <strong>{role}</strong> chez SINAPSE.
      </p>
      <p style={{ color: '#555', fontSize: '14px', lineHeight: '1.6' }}>
        Ce questionnaire vous permet d&apos;auto-&eacute;valuer vos
        comp&eacute;tences sur une &eacute;chelle de 0 (inconnu) &agrave; 5
        (expert). Soyez honn&ecirc;te &mdash; il n&apos;y a pas de mauvaise
        r&eacute;ponse. Vos r&eacute;ponses sont sauvegard&eacute;es
        automatiquement.
      </p>
      <p style={{ color: '#555', fontSize: '14px', lineHeight: '1.6' }}>
        R&eacute;pondez avec sinc&eacute;rit&eacute; : ces r&eacute;ponses servent
        de base &agrave; l&apos;entretien technique. Les comp&eacute;tences
        indiqu&eacute;es comme ma&icirc;tris&eacute;es pourront &ecirc;tre
        approfondies et challeng&eacute;es avec vous. L&apos;objectif n&apos;est
        pas d&apos;obtenir un score parfait, mais de pr&eacute;parer un
        &eacute;change utile et juste.
      </p>
      <div style={{ margin: '32px 0' }}>
        <a
          href={evaluationUrl}
          style={{
            display: 'inline-block',
            background: '#2563eb',
            color: 'white',
            padding: '14px 28px',
            borderRadius: '8px',
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: '16px',
          }}
        >
          Commencer l&apos;&eacute;valuation
        </a>
      </div>
      <p style={{ color: '#999', fontSize: '12px', lineHeight: '1.5' }}>
        Ce lien est personnel et expire dans 30 jours. Ne le partagez pas.
        <br />
        Si vous avez des questions, contactez l&apos;&eacute;quipe SINAPSE.
      </p>
    </div>
  )
}

export default CandidateInvite
