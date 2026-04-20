import { SinapseLayout } from './sinapse-layout.js'

interface CandidatureRecueProps {
  candidateName: string
  role: string
}

export function CandidatureRecue({ candidateName }: CandidatureRecueProps) {
  return (
    <SinapseLayout>
      <p style={{ margin: '0 0 16px 0' }}>Bonjour {candidateName},</p>
      <p style={{ margin: '0 0 16px 0' }}>
        Nous vous remercions vivement pour l&apos;int&eacute;r&ecirc;t que vous
        portez au GIE SINAPSE et &agrave; son projet de refonte des parcours des
        travailleurs ind&eacute;pendants, des employeurs ainsi que des socles
        transverses, briques fondamentales du SI CAFAT.
      </p>
      <p style={{ margin: '0 0 16px 0' }}>
        Votre candidature a bien &eacute;t&eacute; enregistr&eacute;e. Notre
        &eacute;quipe va l&apos;&eacute;tudier dans les prochains jours.
      </p>
      <p style={{ margin: '0 0 16px 0' }}>
        Si votre profil est retenu pour la suite du processus, nous vous
        adresserons par email un lien personnel vers notre questionnaire
        d&apos;auto-&eacute;valuation des comp&eacute;tences. Vous n&apos;avez
        donc rien &agrave; remplir d&egrave;s maintenant&nbsp;: nous reviendrons
        vers vous le moment venu.
      </p>
      <p style={{ margin: '0 0 16px 0' }}>
        Le GIE SINAPSE intervient en tant qu&apos;assistant &agrave;
        ma&icirc;trise d&apos;ouvrage pour le compte de la CAFAT sur ce
        programme structurant, pilier de sa transformation digitale.
      </p>
      <p style={{ margin: '0 0 16px 0' }}>
        En l&apos;absence de r&eacute;ponse de notre part dans un d&eacute;lai
        de 15 jours, vous pourrez consid&eacute;rer que nous ne sommes pas en
        mesure de donner une suite favorable &agrave; votre candidature.
      </p>
      <p style={{ margin: '0 0 16px 0' }}>
        Nous vous remercions pour votre d&eacute;marche et vous souhaitons
        pleine r&eacute;ussite dans vos projets professionnels.
      </p>
      <p style={{ margin: '0' }}>Cordialement,</p>
    </SinapseLayout>
  )
}

/** Internal notification email to lead / director about a new application */
export function CandidatureRecueLead({
  candidateName,
  role,
}: CandidatureRecueProps) {
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
        Nouvelle candidature
      </h1>
      <p style={{ margin: '0 0 12px 0' }}>
        <strong>{candidateName}</strong> a postul&eacute; pour le poste de{' '}
        <strong>{role}</strong>.
      </p>
      <p style={{ margin: '0' }}>
        Consultez le pipeline de recrutement pour examiner cette candidature.
      </p>
    </SinapseLayout>
  )
}

export default CandidatureRecue
