import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import VisxRadarChart from '@/components/visx-radar-chart'
import type { RadarDataPoint } from '@/components/visx-radar-chart'
import { STATUT_LABELS, CANAL_LABELS } from '@/lib/constants'

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
  tauxSoft: number | null
  tauxGlobal: number | null
  createdAt: string
}

interface CandidatureDetail {
  candidature: {
    id: string
    statut: string
    canal: string
    tauxPoste: number | null
    tauxEquipe: number | null
    tauxSoft: number | null
    tauxGlobal: number | null
  }
  candidate: {
    id: string
    name: string
    ratings: Record<string, number>
    aiSuggestions: Record<string, number>
    hasCv: boolean
  }
  gaps: { skill: string; category: string; candidateScore: number; teamAvg: number; gap: number }[]
}

interface CategoryInfo {
  id: string
  label: string
  skills: { id: string; label: string }[]
}

interface AboroProfile {
  traits: Record<string, Record<string, number>>
  talent_cloud: Record<string, string>
  talents: string[]
  axes_developpement: string[]
}

interface CandidateData {
  candidature: Candidature
  detail: CandidatureDetail | null
  aboro: AboroProfile | null
  topStrengths: { skill: string; score: number }[]
  radarData: RadarDataPoint[]
}

export default function ReportComparisonPage() {
  const { posteId } = useParams<{ posteId: string }>()
  const [loading, setLoading] = useState(true)
  const [candidates, setCandidates] = useState<CandidateData[]>([])
  const [categories, setCategories] = useState<CategoryInfo[]>([])
  const [posteTitre, setPosteTitre] = useState('')

  useEffect(() => {
    if (!posteId) return

    const loadData = async () => {
      try {
        const [candidaturesRes, catalogRes] = await Promise.all([
          fetch('/api/recruitment/candidatures', { credentials: 'include' }),
          fetch('/api/catalog'),
        ])

        const allCandidatures: Candidature[] = candidaturesRes.ok ? await candidaturesRes.json() : []
        const catalog = catalogRes.ok ? await catalogRes.json() : { categories: [] }
        const cats: CategoryInfo[] = catalog.categories ?? []
        setCategories(cats)

        const posteCandidatures = allCandidatures.filter(c => c.posteId === posteId && c.statut !== 'refuse')
        if (posteCandidatures.length > 0) {
          setPosteTitre(posteCandidatures[0].posteTitre)
        }

        // Fetch detail + aboro for each candidate
        const candidateDataList: CandidateData[] = await Promise.all(
          posteCandidatures.map(async (c) => {
            const [detailRes, aboroRes] = await Promise.all([
              fetch(`/api/recruitment/candidatures/${c.id}`, { credentials: 'include' }).then(r => r.ok ? r.json() : null),
              fetch(`/api/recruitment/candidates/${c.candidateId}/aboro`, { credentials: 'include' }).then(r => r.ok ? r.json() : null),
            ])

            const detail: CandidatureDetail | null = detailRes
            const aboro: AboroProfile | null = aboroRes?.profile ?? null

            // Calculate top strengths from ratings
            const ratings = detail?.candidate?.ratings ?? {}
            const aiSuggestions = detail?.candidate?.aiSuggestions ?? {}
            const effectiveRatings = { ...aiSuggestions, ...ratings }

            // Build skill label lookup
            const skillLabels: Record<string, string> = {}
            for (const cat of cats) {
              for (const s of cat.skills) {
                skillLabels[s.id] = s.label
              }
            }

            const topStrengths = Object.entries(effectiveRatings)
              .map(([id, score]) => ({ skill: skillLabels[id] ?? id, score }))
              .sort((a, b) => b.score - a.score)
              .slice(0, 3)

            // Radar data
            const radarData: RadarDataPoint[] = cats.map(cat => {
              const skills = cat.skills.map(s => effectiveRatings[s.id] ?? 0)
              const rated = skills.filter(v => v > 0)
              return {
                label: cat.label.replace(/&/g, '\n&'),
                value: rated.length > 0 ? rated.reduce((a, b) => a + b, 0) / rated.length : 0,
                fullMark: 5,
              }
            })

            return { candidature: c, detail, aboro, topStrengths, radarData }
          })
        )

        setCandidates(candidateDataList)
      } catch (err) {
        console.error('[Report Comparison] Error:', err)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [posteId])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Use first candidate radar as primary, second as overlay (if exists)
  const primaryRadar = candidates[0]?.radarData ?? []
  const overlayRadar = candidates.length > 1 ? candidates[1]?.radarData : undefined

  return (
    <div className="min-h-screen bg-white text-black print:text-black">
      <style>{`@media print { .no-print { display: none !important; } @page { size: landscape; margin: 1cm; } }`}</style>

      {/* Print button */}
      <div className="no-print fixed top-4 right-4 z-50">
        <Button onClick={() => window.print()} size="sm">
          <Printer className="h-4 w-4 mr-2" />
          Imprimer / Enregistrer PDF
        </Button>
      </div>

      <div className="max-w-5xl mx-auto px-8 py-8">
        {/* Header */}
        <div className="text-center mb-8 border-b-2 border-black pb-4">
          <h1 className="text-2xl font-bold uppercase tracking-wide">
            Comparaison des candidats
          </h1>
          <p className="text-sm mt-1">{posteTitre} — GIE SINAPSE</p>
          <p className="text-xs text-gray-500 mt-1">{candidates.length} candidat{candidates.length !== 1 ? 's' : ''} en lice (hors refuses)</p>
        </div>

        {/* Radar overlay chart */}
        {categories.length > 0 && candidates.length > 0 && (
          <div className="mb-8 flex justify-center">
            <div className="w-[500px]">
              <VisxRadarChart
                data={primaryRadar}
                overlay={overlayRadar}
                primaryLabel={candidates[0]?.candidature.candidateName}
                overlayLabel={candidates.length > 1 ? candidates[1]?.candidature.candidateName : undefined}
                height={350}
                showExport={false}
              />
              {candidates.length > 2 && (
                <p className="text-xs text-gray-400 text-center mt-1">
                  Radar : {candidates[0]?.candidature.candidateName} vs {candidates[1]?.candidature.candidateName} (les autres candidats sont dans le tableau ci-dessous)
                </p>
              )}
            </div>
          </div>
        )}

        {/* Comparison table */}
        <div className="mb-8 overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-black text-left">
                <th className="py-2 font-medium">Candidat</th>
                <th className="py-2 font-medium">Statut</th>
                <th className="py-2 font-medium">Canal</th>
                <th className="py-2 font-medium text-right">Poste</th>
                <th className="py-2 font-medium text-right">Equipe</th>
                <th className="py-2 font-medium text-right">Soft</th>
                <th className="py-2 font-medium text-right">Global</th>
                <th className="py-2 font-medium">Top 3 competences</th>
                <th className="py-2 font-medium">Aboro</th>
              </tr>
            </thead>
            <tbody>
              {candidates
                .sort((a, b) => (b.candidature.tauxGlobal ?? 0) - (a.candidature.tauxGlobal ?? 0))
                .map(cd => (
                <tr key={cd.candidature.id} className="border-b border-gray-200">
                  <td className="py-2 font-medium">{cd.candidature.candidateName}</td>
                  <td className="py-2 text-xs">{STATUT_LABELS[cd.candidature.statut] ?? cd.candidature.statut}</td>
                  <td className="py-2 text-xs">{CANAL_LABELS[cd.candidature.canal] ?? cd.candidature.canal}</td>
                  <td className="py-2 text-right font-mono">{cd.candidature.tauxPoste != null ? `${cd.candidature.tauxPoste}%` : '—'}</td>
                  <td className="py-2 text-right font-mono">{cd.candidature.tauxEquipe != null ? `${cd.candidature.tauxEquipe}%` : '—'}</td>
                  <td className="py-2 text-right font-mono">{cd.candidature.tauxSoft != null ? `${cd.candidature.tauxSoft}%` : '—'}</td>
                  <td className="py-2 text-right font-bold font-mono">{cd.candidature.tauxGlobal != null ? `${cd.candidature.tauxGlobal}%` : '—'}</td>
                  <td className="py-2 text-xs">
                    {cd.topStrengths.length > 0
                      ? cd.topStrengths.map(s => `${s.skill} (${s.score})`).join(', ')
                      : '—'
                    }
                  </td>
                  <td className="py-2 text-xs">
                    {cd.aboro
                      ? `${cd.aboro.talents.slice(0, 2).join(', ') || 'Profil disponible'}`
                      : '—'
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Aboro summary per candidate (if available) */}
        {candidates.some(cd => cd.aboro) && (
          <div className="mb-8">
            <h2 className="text-lg font-bold border-b pb-1 mb-3">Profils comportementaux</h2>
            <div className="grid grid-cols-2 gap-4">
              {candidates.filter(cd => cd.aboro).map(cd => (
                <div key={cd.candidature.id} className="border rounded p-3">
                  <p className="font-medium text-sm mb-1">{cd.candidature.candidateName}</p>
                  {cd.aboro!.talents.length > 0 && (
                    <div className="mb-1">
                      <span className="text-xs text-gray-500">Talents: </span>
                      <span className="text-xs">{cd.aboro!.talents.slice(0, 4).join(', ')}</span>
                    </div>
                  )}
                  {cd.aboro!.axes_developpement.length > 0 && (
                    <div>
                      <span className="text-xs text-gray-500">Axes dev.: </span>
                      <span className="text-xs">{cd.aboro!.axes_developpement.slice(0, 3).join(', ')}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="border-t-2 border-black pt-4 text-center text-xs text-gray-500">
          <p>Genere par Skill Radar — GIE SINAPSE</p>
          <p>Document confidentiel — {new Date().toLocaleDateString('fr-FR')}</p>
        </div>
      </div>
    </div>
  )
}
