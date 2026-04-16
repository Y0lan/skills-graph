import { SinapseLayout } from './sinapse-layout.js'

interface CandidatureRefuseeProps {
  candidateName: string
  role: string
}

/** Decline email sent to the candidate */
export function CandidatureRefusee({
  candidateName,
}: CandidatureRefuseeProps) {
  return (
    <SinapseLayout>
      <p style={{ margin: '0 0 16px 0' }}>
        Bonjour Monsieur/Madame {candidateName},
      </p>
      <p style={{ margin: '0 0 16px 0' }}>
        Nous vous remercions chaleureusement pour l&apos;int&eacute;r&ecirc;t
        que vous portez au GIE SINAPSE ainsi que pour votre candidature.
      </p>
      <p style={{ margin: '0 0 16px 0' }}>
        Apr&egrave;s avoir examin&eacute; attentivement votre dossier, nous
        avons le regret de vous informer que votre profil ne correspond pas
        &agrave; nos besoins actuels.
      </p>
      <p style={{ margin: '0 0 16px 0' }}>
        Nous vous souhaitons une bonne continuation dans la poursuite de vos
        recherches.
      </p>
      <p style={{ margin: '0' }}>Cordialement,</p>
    </SinapseLayout>
  )
}

interface CandidatureRefuseeLeadProps {
  candidateName: string
  role: string
  reason?: string
  includeReason?: boolean
}

/** Internal notification email to the lead about the decline */
export function CandidatureRefuseeLead({
  candidateName,
  role,
  reason,
  includeReason,
}: CandidatureRefuseeLeadProps) {
  return (
    <SinapseLayout>
      <h1
        style={{
          fontSize: '20px',
          fontWeight: 700,
          color: '#1a1a1a',
          margin: '0 0 12px 0',
        }}
      >
        Candidature refus&eacute;e
      </h1>
      <p style={{ margin: '0 0 12px 0' }}>
        La candidature de <strong>{candidateName}</strong> pour le poste de{' '}
        <strong>{role}</strong> a &eacute;t&eacute; refus&eacute;e.
      </p>
      {reason && (
        <div
          style={{
            margin: '12px 0',
            padding: '12px 16px',
            background: '#f9fafb',
            borderRadius: '8px',
            borderLeft: '3px solid #d1d5db',
          }}
        >
          <p
            style={{
              color: '#555',
              fontSize: '14px',
              lineHeight: '1.6',
              margin: '0',
            }}
          >
            <strong>Motif&nbsp;:</strong> {reason}
          </p>
        </div>
      )}
      <p
        style={{
          color: '#999',
          fontSize: '12px',
          lineHeight: '1.5',
          margin: '0',
        }}
      >
        {includeReason
          ? "Le motif a \u00e9t\u00e9 communiqu\u00e9 au candidat."
          : "Le motif n'a pas \u00e9t\u00e9 communiqu\u00e9 au candidat."}
      </p>
    </SinapseLayout>
  )
}

export default CandidatureRefusee
