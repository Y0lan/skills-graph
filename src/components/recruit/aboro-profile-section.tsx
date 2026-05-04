import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, PenLine } from 'lucide-react'
import AboroManualForm from '@/components/recruit/aboro-manual-form'
import type { AboroProfile } from '@/hooks/use-candidate-data'
import { formatDateTime } from '@/lib/constants'

export interface AboroProfileSectionProps {
  candidateId: string
  aboroProfile: AboroProfile | null
  hasCandidatures: boolean
  onProfileUpdated: (profile: AboroProfile) => void
}

const COLLABORATION_TRAITS = ['consultation', 'ouverture', 'critique', 'sociabilite'] as const
const ADAPTABILITY_TRAITS = ['changement', 'taches_variees', 'inventivite'] as const
const LEADERSHIP_TRAITS = ['ascendant', 'conviction', 'initiative'] as const
const ALERT_THRESHOLD = 4

const TRAIT_LABELS: Record<string, string> = {
  ascendant: 'Ascendant', conviction: 'Conviction', sociabilite: 'Sociabilité', diplomatie: 'Diplomatie',
  implication: 'Implication', ouverture: 'Ouverture', critique: 'Accepte les critiques', consultation: 'Consultation',
  taches_variees: 'Tâches variées', abstraction: 'Abstraction', inventivite: 'Inventivité', changement: 'Changement',
  methode: 'Méthode', details: 'Détails', perseverance: 'Persévérance', initiative: 'Initiative',
  detente: 'Détente', positivite: 'Positivité', controle: 'Contrôle émotionnel', stabilite: 'Stabilité',
}

function avg(values: number[]): number {
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 5
}

function allTraits(profile: AboroProfile): Record<string, number> {
  const out: Record<string, number> = {}
  for (const axis of Object.values(profile.traits ?? {})) {
    for (const [key, val] of Object.entries(axis ?? {})) out[key] = Number(val)
  }
  return out
}

function buildSoftBreakdown(profile: AboroProfile) {
  const traits = allTraits(profile)
  const groups = [
    { key: 'collaboration', label: 'Collaboration', weight: 0.4, traitIds: COLLABORATION_TRAITS },
    { key: 'adaptability', label: 'Adaptabilité', weight: 0.3, traitIds: ADAPTABILITY_TRAITS },
    { key: 'leadership', label: 'Leadership', weight: 0.3, traitIds: LEADERSHIP_TRAITS },
  ].map(g => {
    const items = g.traitIds.map(id => ({ id, label: TRAIT_LABELS[id] ?? id, value: traits[id] ?? 1 }))
    const groupAvg = avg(items.map(t => t.value))
    return {
      ...g,
      avg: Math.round(groupAvg * 10) / 10,
      contribution: Math.round(groupAvg * g.weight * 10),
      traits: items,
    }
  })
  const score = Math.round(groups.reduce((sum, g) => sum + g.avg * g.weight, 0) * 10)
  const alertIds = [...COLLABORATION_TRAITS, ...ADAPTABILITY_TRAITS]
  const alerts = alertIds
    .map(id => ({ id, label: TRAIT_LABELS[id] ?? id, value: traits[id] ?? 1 }))
    .filter(t => t.value < ALERT_THRESHOLD)
  return { score, groups, alerts }
}

export default function AboroProfileSection({
  candidateId,
  aboroProfile,
  hasCandidatures,
  onProfileUpdated,
}: AboroProfileSectionProps) {
  const [showAboroForm, setShowAboroForm] = useState(false)

  if (aboroProfile) {
    const softBreakdown = buildSoftBreakdown(aboroProfile)
    const score = aboroProfile._meta?.softSkillScore ?? softBreakdown.score
    const sourceLabel = aboroProfile._meta?.source === 'manual'
      ? 'saisie manuelle'
      : aboroProfile._meta?.sourceDocumentName
        ? `PDF ${aboroProfile._meta.sourceDocumentName}`
        : 'rapport Âboro/SWIPE'

    return (
      <Card className="lg:col-span-2">
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base">Profil comportemental (Âboro / SWIPE)</CardTitle>
            <p className="text-xs text-muted-foreground">
              Score Soft calculé depuis les traits Âboro : collaboration 40 %, adaptabilité 30 %, leadership 30 %.
              {' '}Source : {sourceLabel}
              {aboroProfile._meta?.createdAt ? ` · ${formatDateTime(aboroProfile._meta.createdAt)}` : ''}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowAboroForm(prev => !prev)}>
            <PenLine className="h-3.5 w-3.5 mr-1" />
            {showAboroForm ? 'Fermer' : 'Corriger'}
          </Button>
        </CardHeader>
        <CardContent>
          <div className="mb-5 rounded-md border bg-muted/20 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Score Soft</p>
                <p className="text-3xl font-semibold tabular-nums">{score}%</p>
              </div>
              <Badge variant="secondary" className="text-[10px]">
                formule Âboro/SWIPE
              </Badge>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              {softBreakdown.groups.map(group => (
                <div key={group.key} className="rounded-md border bg-background/60 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium">{group.label}</p>
                    <span className="text-[11px] text-muted-foreground tabular-nums">{group.avg}/10</span>
                  </div>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    poids {Math.round(group.weight * 100)} % · contribution {group.contribution} pts
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {group.traits.map(t => (
                      <Badge key={t.id} variant="outline" className="text-[10px]">
                        {t.label}: {t.value}/10
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {softBreakdown.alerts.length > 0 && (
              <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                <p className="flex items-center gap-1 text-xs font-medium">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Points à challenger en entretien
                </p>
                <p className="mt-1 text-[11px]">
                  {softBreakdown.alerts.map(a => `${a.label} ${a.value}/10`).join(' · ')}
                </p>
              </div>
            )}
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Traits by axis */}
            <div className="space-y-4">
              {[
                { key: 'leadership', label: 'Leadership / Influence', color: 'bg-rose-500' },
                { key: 'prise_en_compte', label: 'Prise en compte des autres', color: 'bg-sky-500' },
                { key: 'creativite', label: 'Créativité / Adaptabilité', color: 'bg-amber-500' },
                { key: 'rigueur', label: 'Rigueur dans le travail', color: 'bg-emerald-500' },
                { key: 'equilibre', label: 'Équilibre personnel', color: 'bg-violet-500' },
              ].map(axis => {
                const traits = aboroProfile.traits[axis.key]
                if (!traits) return null
                return (
                  <div key={axis.key}>
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">{axis.label}</p>
                    <div className="space-y-1">
                      {Object.entries(traits).map(([traitKey, score]) => {
                        return (
                          <div key={traitKey} className="flex items-center gap-2">
                            <span className="text-xs w-28 truncate">{TRAIT_LABELS[traitKey] ?? traitKey}</span>
                            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${axis.color}`} style={{ width: `${(score as number / 10) * 100}%` }} />
                            </div>
                            <span className="text-xs font-mono w-5 text-right">{score as number}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Talent Cloud + Insights */}
            <div className="space-y-4">
              {/* Talent Cloud */}
              {Object.keys(aboroProfile.talent_cloud ?? {}).length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Talent Cloud</p>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(aboroProfile.talent_cloud ?? {}).map(([name, level]) => {
                      const levelColors: Record<string, string> = {
                        distinctif: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
                        avere: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
                        mobilisable: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
                        a_developper: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
                        non_developpe: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
                      }
                      return (
                        <Badge key={name} variant="secondary" className={`text-[10px] ${levelColors[level] ?? ''}`}>
                          {name}
                        </Badge>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Talents */}
              {aboroProfile.talents.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Talents</p>
                  <ul className="text-xs space-y-0.5 text-foreground">
                    {aboroProfile.talents.slice(0, 6).map((t, i) => (
                      <li key={i} className="flex items-start gap-1">
                        <span className="text-green-500 mt-0.5">+</span> {t}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Axes de développement */}
              {aboroProfile.axes_developpement.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Axes de développement</p>
                  <ul className="text-xs space-y-0.5 text-foreground">
                    {aboroProfile.axes_developpement.slice(0, 6).map((a, i) => (
                      <li key={i} className="flex items-start gap-1">
                        <span className="text-amber-500 mt-0.5">!</span> {a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Matrices comportementales */}
              {aboroProfile.matrices && aboroProfile.matrices.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Matrices comportementales</p>
                  <div className="grid gap-1.5">
                    {aboroProfile.matrices.map((m, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="w-32 text-muted-foreground truncate">{m.dimension}</span>
                        <Badge variant="secondary" className="text-[10px]">Naturel: {m.naturel}</Badge>
                        <Badge variant="outline" className="text-[10px]">Mobilisable: {m.mobilisable}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          {showAboroForm && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-xs font-medium text-muted-foreground mb-3">Correction manuelle des scores</p>
              <AboroManualForm
                candidateId={candidateId}
                initialProfile={aboroProfile}
                onSaved={(profile) => {
                  onProfileUpdated(profile)
                  setShowAboroForm(false)
                  toast.success('Profil Aboro mis a jour')
                }}
              />
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  // Manual Aboro entry when no profile exists
  if (!hasCandidatures) return null

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Profil comportemental (Aboro / SWIPE)</CardTitle>
        <Button size="sm" variant="outline" onClick={() => setShowAboroForm(prev => !prev)}>
          <PenLine className="h-3.5 w-3.5 mr-1" />
          {showAboroForm ? 'Fermer' : 'Saisie manuelle Aboro'}
        </Button>
      </CardHeader>
      <CardContent>
        {showAboroForm ? (
          <AboroManualForm
            candidateId={candidateId}
            onSaved={(profile) => {
              onProfileUpdated(profile)
              setShowAboroForm(false)
              toast.success('Profil Aboro enregistre')
            }}
          />
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            Aucun profil Aboro disponible. Uploadez un PDF Aboro dans les documents ou utilisez la saisie manuelle.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
