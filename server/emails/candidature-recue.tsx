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
        Le GIE SINAPSE intervient en tant qu&apos;assistant &agrave;
        ma&icirc;trise d&apos;ouvrage pour le compte de la CAFAT sur ce
        programme structurant, pilier de sa transformation digitale.
      </p>
      <p style={{ margin: '0 0 16px 0' }}>
        Afin de garantir un traitement &eacute;quitable et structur&eacute; des
        candidatures, celles-ci doivent imp&eacute;rativement &ecirc;tre
        d&eacute;pos&eacute;es via notre site internet&nbsp;:
      </p>
      <p style={{ margin: '0 0 16px 0' }}>
        <a href="https://www.sinapse.nc" style={{ color: '#008272' }}>
          https://www.sinapse.nc
        </a>
      </p>
      <p style={{ margin: '0 0 16px 0' }}>
        Nous vous invitons &agrave; compl&eacute;ter l&apos;ensemble du parcours
        de candidature avec la plus grande attention, en particulier le
        questionnaire, qui constitue un &eacute;l&eacute;ment d&eacute;terminant
        dans l&apos;analyse de l&apos;ad&eacute;quation entre votre profil et
        les enjeux port&eacute;s par SINAPSE.
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
