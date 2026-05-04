import { useEffect, useState } from 'react'
import { Loader2, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { STATUT_LABELS, CANAL_LABELS, POLE_LABELS, formatDateHuman } from '@/lib/constants'

interface Poste {
  id: string
  titre: string
  pole: string
  headcount: number
  candidateCount: number
  activeCount: number
  statut: string
}

interface Candidature {
  id: string
  candidateId: string
  posteId: string
  posteTitre: string
  postePole: string
  statut: string
  canal: string
  candidateName: string
  tauxPoste: number | null
  tauxEquipe: number | null
  tauxGlobal: number | null
  createdAt: string
}

interface DashboardStats {
  poles: { pole: string; poste_count: number; candidature_count: number; active_count: number }[]
  totalCandidatures: number
  totalActive: number
  statusBreakdown: Record<string, number>
}

export default function ReportCampaignPage() {
  const [postes, setPostes] = useState<Poste[]>([])
  const [candidatures, setCandidatures] = useState<Candidature[]>([])
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/recruitment/postes', { credentials: 'include' }).then(r => r.ok ? r.json() : []),
      fetch('/api/recruitment/candidatures', { credentials: 'include' }).then(r => r.ok ? r.json() : []),
      fetch('/api/recruitment/dashboard', { credentials: 'include' }).then(r => r.ok ? r.json() : null),
    ]).then(([p, c, d]) => {
      setPostes(p)
      setCandidatures(c)
      setStats(d)
    }).finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Group by pole
  const postesByPole = new Map<string, Poste[]>()
  for (const p of postes) {
    const list = postesByPole.get(p.pole) ?? []
    list.push(p)
    postesByPole.set(p.pole, list)
  }

  // Canal breakdown
  const canalCounts = new Map<string, number>()
  for (const c of candidatures) {
    canalCounts.set(c.canal, (canalCounts.get(c.canal) ?? 0) + 1)
  }

  // Pipeline funnel
  const statusOrder = ['postule', 'preselectionne', 'skill_radar_envoye', 'skill_radar_complete', 'entretien_1', 'aboro', 'entretien_2', 'proposition', 'embauche', 'refuse']

  const embauches = candidatures.filter(c => c.statut === 'embauche').length
  const conversionRate = candidatures.length > 0 ? Math.round((embauches / candidatures.length) * 100) : 0

  return (
    <div className="min-h-screen bg-white text-black print:text-black">
      <style>{`@media print { .no-print { display: none !important; } }`}</style>

      {/* Print button */}
      <div className="no-print fixed top-4 right-4 z-50">
        <Button onClick={() => window.print()} size="sm">
          <Printer className="h-4 w-4 mr-2" />
          Imprimer / Enregistrer PDF
        </Button>
      </div>

      <div className="max-w-4xl mx-auto px-8 py-8">
        {/* Header */}
        <div className="text-center mb-8 border-b-2 border-black pb-4">
          <h1 className="text-2xl font-bold uppercase tracking-wide">
            Campagne de recrutement — GIE SINAPSE
          </h1>
          <p className="text-sm mt-1">Avril 2026</p>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="text-center p-3 border rounded">
            <p className="text-2xl font-bold">{postes.length}</p>
            <p className="text-xs text-gray-600">Postes ouverts</p>
          </div>
          <div className="text-center p-3 border rounded">
            <p className="text-2xl font-bold">{stats?.totalCandidatures ?? 0}</p>
            <p className="text-xs text-gray-600">Candidatures</p>
          </div>
          <div className="text-center p-3 border rounded">
            <p className="text-2xl font-bold">{embauches}</p>
            <p className="text-xs text-gray-600">Embauches</p>
          </div>
          <div className="text-center p-3 border rounded">
            <p className="text-2xl font-bold">{conversionRate}%</p>
            <p className="text-xs text-gray-600">Taux de conversion</p>
          </div>
        </div>

        {/* By pole */}
        {['legacy', 'java_modernisation', 'fonctionnel'].map(pole => {
          const polePostes = postesByPole.get(pole) ?? []
          if (polePostes.length === 0) return null
          return (
            <div key={pole} className="mb-6">
              <h2 className="text-lg font-bold border-b pb-1 mb-3">
                {POLE_LABELS[pole] ?? pole}
              </h2>
              {polePostes.map(p => {
                const posteCandidatures = candidatures.filter(c => c.posteId === p.id)
                return (
                  <div key={p.id} className="mb-4 ml-4">
                    <h3 className="font-medium text-sm">
                      {p.titre}
                      <span className="text-gray-500 font-normal ml-2">
                        ({p.headcount} poste{p.headcount > 1 ? 's' : ''} — {posteCandidatures.length} candidature{posteCandidatures.length !== 1 ? 's' : ''})
                      </span>
                    </h3>
                    {posteCandidatures.length > 0 && (
                      <table className="w-full text-xs mt-1 ml-2">
                        <thead>
                          <tr className="text-left text-gray-500">
                            <th className="py-1 font-medium">Candidat</th>
                            <th className="py-1 font-medium">Statut</th>
                            <th className="py-1 font-medium">Canal</th>
                            <th className="py-1 font-medium text-right">Global</th>
                          </tr>
                        </thead>
                        <tbody>
                          {posteCandidatures.map(c => (
                            <tr key={c.id} className="border-t border-gray-100">
                              <td className="py-1">{c.candidateName}</td>
                              <td className="py-1">{STATUT_LABELS[c.statut] ?? c.statut}</td>
                              <td className="py-1">{CANAL_LABELS[c.canal] ?? c.canal}</td>
                              <td className="py-1 text-right">{c.tauxGlobal != null ? `${c.tauxGlobal}%` : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}

        {/* Canal breakdown */}
        <div className="mb-6">
          <h2 className="text-lg font-bold border-b pb-1 mb-3">Repartition par canal</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="py-2 font-medium">Canal</th>
                <th className="py-2 font-medium text-right">Candidatures</th>
                <th className="py-2 font-medium text-right">%</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(canalCounts.entries())
                .sort((a, b) => b[1] - a[1])
                .map(([canal, count]) => (
                <tr key={canal} className="border-t border-gray-100">
                  <td className="py-1.5">{CANAL_LABELS[canal] ?? canal}</td>
                  <td className="py-1.5 text-right">{count}</td>
                  <td className="py-1.5 text-right">
                    {candidatures.length > 0 ? Math.round((count / candidatures.length) * 100) : 0}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pipeline funnel */}
        <div className="mb-8">
          <h2 className="text-lg font-bold border-b pb-1 mb-3">Pipeline</h2>
          <div className="space-y-1">
            {statusOrder.map(statut => {
              const count = stats?.statusBreakdown?.[statut] ?? 0
              if (count === 0) return null
              const maxCount = Math.max(...Object.values(stats?.statusBreakdown ?? {}), 1)
              const width = Math.max((count / maxCount) * 100, 5)
              return (
                <div key={statut} className="flex items-center gap-3 text-sm">
                  <span className="w-40 text-right text-gray-600 text-xs">{STATUT_LABELS[statut] ?? statut}</span>
                  <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden">
                    <div
                      className="h-full bg-gray-700 rounded"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                  <span className="w-8 text-right font-medium text-xs">{count}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t-2 border-black pt-4 text-center text-xs text-gray-500">
          <p>Genere par Skill Radar — GIE SINAPSE</p>
          <p>Document confidentiel — {formatDateHuman(new Date().toISOString())}</p>
        </div>
      </div>
    </div>
  )
}
