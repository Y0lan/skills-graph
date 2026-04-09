import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PenLine } from 'lucide-react'
import AboroManualForm from '@/components/recruit/aboro-manual-form'
import type { AboroProfile } from '@/hooks/use-candidate-data'

export interface AboroProfileSectionProps {
  candidateId: string
  aboroProfile: AboroProfile | null
  hasCandidatures: boolean
  onProfileUpdated: (profile: AboroProfile) => void
}

export default function AboroProfileSection({
  candidateId,
  aboroProfile,
  hasCandidatures,
  onProfileUpdated,
}: AboroProfileSectionProps) {
  const [showAboroForm, setShowAboroForm] = useState(false)

  if (aboroProfile) {
    return (
      <Card className="lg:col-span-2">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Profil comportemental (Âboro / SWIPE)</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setShowAboroForm(prev => !prev)}>
            <PenLine className="h-3.5 w-3.5 mr-1" />
            {showAboroForm ? 'Fermer' : 'Corriger'}
          </Button>
        </CardHeader>
        <CardContent>
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
                        const traitLabels: Record<string, string> = {
                          ascendant: 'Ascendant', conviction: 'Conviction', sociabilite: 'Sociabilité', diplomatie: 'Diplomatie',
                          implication: 'Implication', ouverture: 'Ouverture', critique: 'Accepte les critiques', consultation: 'Consultation',
                          taches_variees: 'Tâches variées', abstraction: 'Abstraction', inventivite: 'Inventivité', changement: 'Changement',
                          methode: 'Méthode', details: 'Détails', perseverance: 'Persévérance', initiative: 'Initiative',
                          detente: 'Détente', positivite: 'Positivité', controle: 'Contrôle émotionnel', stabilite: 'Stabilité',
                        }
                        return (
                          <div key={traitKey} className="flex items-center gap-2">
                            <span className="text-xs w-28 truncate">{traitLabels[traitKey] ?? traitKey}</span>
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
              {Object.keys(aboroProfile.talent_cloud).length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Talent Cloud</p>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(aboroProfile.talent_cloud).map(([name, level]) => {
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
