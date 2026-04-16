
interface TransitionNotificationProps {
  candidateName: string
  role: string
  statut: string
  bodyHtml: string
}

/**
 * Generic status transition email.
 * The bodyHtml is the status-specific message (already determined by the caller).
 */
export function TransitionNotification({
  candidateName,
  bodyHtml,
}: TransitionNotificationProps) {
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
        Bonjour {candidateName},
      </h1>
      <p
        style={{ color: '#555', fontSize: '16px', lineHeight: '1.6' }}
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />
      <p
        style={{
          color: '#555',
          fontSize: '14px',
          lineHeight: '1.6',
          marginTop: '24px',
        }}
      >
        Cordialement,
        <br />
        L&apos;&eacute;quipe SINAPSE
      </p>
      <p
        style={{
          color: '#999',
          fontSize: '12px',
          lineHeight: '1.5',
          marginTop: '32px',
        }}
      >
        Cet email est envoy&eacute; automatiquement &mdash; merci de ne pas y
        r&eacute;pondre.
        <br />
        Si vous avez des questions, contactez l&apos;&eacute;quipe SINAPSE.
      </p>
    </div>
  )
}

export default TransitionNotification
