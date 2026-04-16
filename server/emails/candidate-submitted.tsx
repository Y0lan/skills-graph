
interface CandidateSubmittedProps {
  candidateName: string
  role: string
  detailUrl: string
}

/** Notification to lead that a candidate completed their evaluation */
export function CandidateSubmitted({
  candidateName,
  role,
  detailUrl,
}: CandidateSubmittedProps) {
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
        {'\u00C9'}valuation soumise {'\u2705'}
      </h1>
      <p style={{ color: '#555', fontSize: '16px', lineHeight: '1.6' }}>
        <strong>{candidateName}</strong> a termin&eacute; son &eacute;valuation
        pour le poste de <strong>{role}</strong>.
      </p>
      <div style={{ margin: '32px 0' }}>
        <a
          href={detailUrl}
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
          Voir les r&eacute;sultats
        </a>
      </div>
    </div>
  )
}

export default CandidateSubmitted
