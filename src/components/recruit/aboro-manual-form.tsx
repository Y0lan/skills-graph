import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2 } from 'lucide-react'
import type { AboroProfile } from '@/hooks/use-candidate-data'

const AXES = [
  { key: 'leadership', label: 'Leadership / Influence', traits: [
    { key: 'ascendant', label: 'Ascendant' }, { key: 'conviction', label: 'Conviction' },
    { key: 'sociabilite', label: 'Sociabilite' }, { key: 'diplomatie', label: 'Diplomatie' },
  ]},
  { key: 'prise_en_compte', label: 'Prise en compte des autres', traits: [
    { key: 'implication', label: 'Implication' }, { key: 'ouverture', label: 'Ouverture' },
    { key: 'critique', label: 'Accepte les critiques' }, { key: 'consultation', label: 'Consultation' },
  ]},
  { key: 'creativite', label: 'Creativite / Adaptabilite', traits: [
    { key: 'taches_variees', label: 'Taches variees' }, { key: 'abstraction', label: 'Abstraction' },
    { key: 'inventivite', label: 'Inventivite' }, { key: 'changement', label: 'Changement' },
  ]},
  { key: 'rigueur', label: 'Rigueur dans le travail', traits: [
    { key: 'methode', label: 'Methode' }, { key: 'details', label: 'Details' },
    { key: 'perseverance', label: 'Perseverance' }, { key: 'initiative', label: 'Initiative' },
  ]},
  { key: 'equilibre', label: 'Equilibre personnel', traits: [
    { key: 'detente', label: 'Detente' }, { key: 'positivite', label: 'Positivite' },
    { key: 'controle', label: 'Controle emotionnel' }, { key: 'stabilite', label: 'Stabilite' },
  ]},
]

interface AboroManualFormProps {
  candidateId: string
  initialProfile?: AboroProfile | null
  onSaved: (profile: AboroProfile) => void
}

export default function AboroManualForm({ candidateId, initialProfile, onSaved }: AboroManualFormProps) {
  const [traits, setTraits] = useState<Record<string, Record<string, number>>>(() => {
    if (initialProfile?.traits) return initialProfile.traits
    const defaults: Record<string, Record<string, number>> = {}
    for (const axis of AXES) {
      defaults[axis.key] = {}
      for (const t of axis.traits) defaults[axis.key][t.key] = 5
    }
    return defaults
  })
  const [saving, setSaving] = useState(false)

  const setTrait = useCallback((axis: string, trait: string, value: number) => {
    setTraits(prev => ({ ...prev, [axis]: { ...prev[axis], [trait]: Math.max(1, Math.min(10, value)) } }))
  }, [])

  const handleSubmit = useCallback(async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/recruitment/candidates/${candidateId}/aboro/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ traits }),
      })
      if (!res.ok) throw new Error('Erreur')
      const data = await res.json()
      onSaved({
        ...data.profile,
        _meta: {
          source: 'manual',
          softSkillScore: data.softSkillScore,
          softSkillAlerts: data.alerts,
        },
      })
    } catch {
      // silent — toast would be better but keep it simple
    } finally {
      setSaving(false)
    }
  }, [candidateId, traits, onSaved])

  return (
    <div className="space-y-4">
      {AXES.map(axis => (
        <div key={axis.key}>
          <p className="text-xs font-medium text-muted-foreground mb-2">{axis.label}</p>
          <div className="grid grid-cols-2 gap-2">
            {axis.traits.map(t => (
              <div key={t.key} className="flex items-center gap-2">
                <span className="text-xs w-24 truncate">{t.label}</span>
                <Input
                  type="number" min={1} max={10}
                  value={traits[axis.key]?.[t.key] ?? 5}
                  onChange={e => setTrait(axis.key, t.key, parseInt(e.target.value) || 5)}
                  className="h-7 w-16 text-xs"
                />
              </div>
            ))}
          </div>
        </div>
      ))}
      <Button onClick={handleSubmit} disabled={saving} size="sm">
        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        Enregistrer le profil Aboro
      </Button>
    </div>
  )
}
