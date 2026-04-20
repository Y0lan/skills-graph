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
        <strong>Vous n&apos;avez rien &agrave; remplir &agrave; ce stade.</strong>
        {' '}Si votre profil correspond &agrave; nos besoins, nous reviendrons
        vers vous par email avec un lien personnel vers un questionnaire
        d&apos;auto-&eacute;valuation des comp&eacute;tences.
      </p>
      <p style={{ margin: '0 0 16px 0' }}>
        Ce questionnaire sera &agrave; remplir avec la plus grande
        honn&ecirc;tet&eacute;&nbsp;: chacune de vos r&eacute;ponses pourra
        &ecirc;tre discut&eacute;e et challeng&eacute;e lors d&apos;un entretien
        avec notre &eacute;quipe technique.
      </p>
      <p style={{ margin: '0 0 16px 0' }}>
        Le GIE SINAPSE intervient en tant qu&apos;assistant &agrave;
        ma&icirc;trise d&apos;ouvrage pour le compte de la CAFAT sur un
        programme structurant de transformation num&eacute;rique de la
        protection sociale.
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
