import AppHeader from '@/components/app-header'

export default function MentionsLegalesPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader />
      <main className="flex-1 container mx-auto max-w-3xl px-4 pt-16 pb-12">
        <h1 className="text-2xl font-bold mb-6">Mentions légales</h1>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-6">
          <section>
            <h2 className="text-lg font-semibold">Éditeur</h2>
            <p>
              GIE SINAPSE (Groupement d'Intérêt Économique "Système d'Information Protection Sociale")<br />
              Immeuble Botticelli, 29 rue Georges Clémenceau, Centre Ville<br />
              98800 Nouméa, Nouvelle-Calédonie<br />
              Tél : +687 23 09 89<br />
              Email : <a href="mailto:contact@sinapse.nc" className="text-primary hover:underline">contact@sinapse.nc</a>
            </p>
            <p>
              Directeur de la publication : M. Guillaume BENOIT, Directeur du GIE SINAPSE
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Hébergement</h2>
            <p>
              Google Cloud Platform (Cloud Run et Cloud SQL)<br />
              Région : asia-northeast1<br />
              Google Cloud EMEA Limited
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Propriété intellectuelle</h2>
            <p>
              L'ensemble des éléments du site (textes, images, graphismes, logo, icônes, logiciels)
              sont la propriété exclusive du GIE SINAPSE ou font l'objet d'une autorisation d'utilisation.
              Toute reproduction, représentation, modification, publication ou adaptation de tout ou partie
              des éléments du site, quel que soit le moyen ou le procédé utilisé, est interdite sauf
              autorisation écrite préalable du GIE SINAPSE. Toute exploitation non autorisée du site
              ou de l'un quelconque des éléments qu'il contient sera considérée comme constitutive d'une
              contrefaçon au sens du code de la propriété intellectuelle.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Utilisation de l'intelligence artificielle</h2>
            <p>
              Le Skill Radar utilise des services d'intelligence artificielle (Anthropic Claude) pour :
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>L'extraction automatique de compétences depuis les CV des candidats</li>
              <li>L'extraction de profils comportementaux depuis les rapports Âboro/SWIPE</li>
              <li>La génération de rapports d'analyse comparative</li>
            </ul>
            <p>
              Conformément à la politique du GIE SINAPSE : <strong>l'humain augmenté reste décideur
              et au centre. L'IA est un outil d'aide, pas un substitut au jugement professionnel.</strong>{' '}
              Aucune décision de recrutement n'est prise de manière automatisée.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Protection des données personnelles</h2>
            <p>
              Conformément aux lois n° 78-17 du 6 janvier 1978, n° 2004-801 du 6 août 2004,
              n° 2004-575 du 21 juin 2004 et au Règlement Général sur la Protection des Données (RGPD),
              l'utilisateur dispose d'un droit d'accès, de rectification et d'opposition aux données
              personnelles le concernant, en effectuant sa demande écrite à{' '}
              <a href="mailto:contact@sinapse.nc" className="text-primary hover:underline">contact@sinapse.nc</a>.
            </p>
            <p>
              Pour plus de détails, consultez notre{' '}
              <a href="/confidentialite" className="text-primary hover:underline">politique de confidentialité</a>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Limitation de responsabilité</h2>
            <p>
              Le GIE SINAPSE ne saurait être tenu pour responsable des dommages directs ou indirects
              résultant de l'accès ou de l'utilisation du site, y compris l'inaccessibilité, les pertes
              de données, détériorations, destructions ou virus qui pourraient affecter l'équipement
              informatique de l'utilisateur.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Droit applicable</h2>
            <p>
              Le présent site est régi par le droit français. En cas de litige, compétence est
              attribuée aux tribunaux de Nouméa.
            </p>
          </section>
        </div>
      </main>
    </div>
  )
}
