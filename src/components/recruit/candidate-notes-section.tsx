import { useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface StructuredNotes {
  forces: string
  vigilance: string
  recommandation: string
  libre: string
}

function parseNotes(raw: string): StructuredNotes {
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && 'forces' in parsed) {
      return {
        forces: parsed.forces ?? '',
        vigilance: parsed.vigilance ?? '',
        recommandation: parsed.recommandation ?? '',
        libre: parsed.libre ?? '',
      }
    }
  } catch { /* not JSON */ }
  // Backward compat: old free-text notes go into the "libre" field
  return { forces: '', vigilance: '', recommandation: '', libre: raw }
}

export interface CandidateNotesSectionProps {
  candidateId: string
  candidatureId?: string
  notes: string
  onNotesChange: (notes: string) => void
}

export default function CandidateNotesSection({
  candidatureId,
  notes,
  onNotesChange,
}: CandidateNotesSectionProps) {
  const [fields, setFields] = useState<StructuredNotes>(() => parseNotes(notes))
  const [saving, setSaving] = useState(false)

  function update(key: keyof StructuredNotes, value: string) {
    setFields(prev => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    if (!candidatureId) return
    const serialized = JSON.stringify(fields)
    setSaving(true)
    try {
      const res = await fetch(`/api/recruitment/candidatures/${candidatureId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ notes: serialized }),
      })
      if (!res.ok) throw new Error('Erreur serveur')
      onNotesChange(serialized)
      toast.success('Notes enregistrées')
    } catch {
      toast.error('Échec de l\'enregistrement')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Notes d'entretien</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Forces observées</label>
          <Textarea
            value={fields.forces}
            onChange={e => update('forces', e.target.value)}
            placeholder="Points forts identifiés durant l'entretien"
            rows={2}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Points de vigilance</label>
          <Textarea
            value={fields.vigilance}
            onChange={e => update('vigilance', e.target.value)}
            placeholder="Points à surveiller ou faiblesses"
            rows={2}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Recommandation</label>
          <Select
            value={fields.recommandation}
            onValueChange={val => update('recommandation', val ?? '')}
          >
            <SelectTrigger>
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Favorable">Favorable</SelectItem>
              <SelectItem value="Réservé">Réservé</SelectItem>
              <SelectItem value="Défavorable">Défavorable</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Notes libres</label>
          <Textarea
            value={fields.libre}
            onChange={e => update('libre', e.target.value)}
            placeholder="Observations complémentaires..."
            rows={2}
          />
        </div>

        <Button onClick={handleSave} disabled={saving || !candidatureId} size="sm">
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </Button>
      </CardContent>
    </Card>
  )
}
