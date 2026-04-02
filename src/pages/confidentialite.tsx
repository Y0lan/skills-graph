import AppHeader from '@/components/app-header'
import Footer from '@/components/footer'

export default function ConfidentialitePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader />
      <main className="flex-1 container mx-auto max-w-3xl px-4 pt-16 pb-12">
        <h1 className="text-2xl font-bold mb-6">Politique de confidentialité</h1>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-6">
          <section>
            <h2 className="text-lg font-semibold">Responsable du traitement</h2>
            <p>
              GIE SINAPSE, représenté par Guillaume BENOIT, Directeur.<br />
              Contact : <a href="mailto:contact@sinapse.nc" className="text-primary hover:underline">contact@sinapse.nc</a>
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Données collectées</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Donnée</th>
                  <th className="text-left py-2">Base légale</th>
                  <th className="text-left py-2">Conservation</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b"><td className="py-2">Nom, prénom, email, téléphone</td><td>Intérêt légitime (recrutement)</td><td>Campagne + 2 ans</td></tr>
                <tr className="border-b"><td className="py-2">CV, lettre de motivation</td><td>Consentement</td><td>Campagne + 2 ans</td></tr>
                <tr className="border-b"><td className="py-2">Auto-évaluation de compétences</td><td>Consentement</td><td>Campagne + 2 ans</td></tr>
                <tr className="border-b"><td className="py-2">Rapport Âboro (profil comportemental)</td><td>Consentement</td><td>Campagne + 2 ans</td></tr>
                <tr className="border-b"><td className="py-2">Scores de compatibilité (calculés)</td><td>Intérêt légitime</td><td>Campagne + 2 ans</td></tr>
                <tr className="border-b"><td className="py-2">Notes d'entretien</td><td>Intérêt légitime</td><td>Campagne + 2 ans</td></tr>
                <tr><td className="py-2">Adresse IP (logs serveur)</td><td>Intérêt légitime</td><td>12 mois</td></tr>
              </tbody>
            </table>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Traitements utilisant l'intelligence artificielle</h2>
            <p>Le Skill Radar utilise l'IA (Anthropic Claude) pour :</p>
            <ol className="list-decimal pl-5 space-y-2">
              <li>
                <strong>Extraction de compétences depuis le CV</strong> — Le texte du CV est analysé pour
                identifier et noter les compétences du candidat. Le candidat peut corriger les résultats
                avant soumission de son auto-évaluation.
              </li>
              <li>
                <strong>Extraction du profil comportemental</strong> — Les scores du rapport Âboro/SWIPE
                sont extraits automatiquement. Le recruteur peut corriger via saisie manuelle.
              </li>
              <li>
                <strong>Calcul de compatibilité</strong> — Algorithme déterministe (pas d'IA) comparant
                les compétences du candidat aux exigences du poste. Pondération configurable.
              </li>
            </ol>
            <p className="font-medium">
              Aucune décision de recrutement n'est prise de manière automatisée.
              Les scores et analyses sont des outils d'aide à la décision destinés aux recruteurs.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Sous-traitant IA</h2>
            <p>
              Anthropic, PBC (San Francisco, USA) — API Claude.<br />
              Les données envoyées à l'API (texte de CV, texte de rapport Âboro) ne sont pas conservées
              par Anthropic au-delà du traitement de la requête. Anthropic ne les utilise pas pour
              l'entraînement de ses modèles.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Vos droits</h2>
            <p>Conformément à la réglementation applicable, vous disposez des droits suivants :</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Droit d'accès</strong> — Obtenir une copie de l'ensemble de vos données</li>
              <li><strong>Droit de rectification</strong> — Faire modifier des données inexactes</li>
              <li><strong>Droit à l'effacement</strong> — Demander la suppression complète de votre dossier</li>
              <li><strong>Droit d'opposition</strong> — Vous retirer du processus de recrutement à tout moment</li>
              <li><strong>Droit à l'explication</strong> — Comprendre comment votre score de compatibilité a été calculé</li>
            </ul>
            <p>
              Pour exercer ces droits, contactez : <a href="mailto:contact@sinapse.nc" className="text-primary hover:underline">contact@sinapse.nc</a>
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Hébergement et sécurité</h2>
            <p>
              Les données sont hébergées sur Google Cloud Platform (GKE Autopilot, région asia-northeast1).
              Les communications sont chiffrées en transit (TLS). Les sauvegardes sont répliquées
              via Litestream vers Google Cloud Storage.
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  )
}
