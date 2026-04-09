import { useCallback, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'

export interface CandidateNotesSectionProps {
  candidateId: string
  notes: string
  onNotesChange: (notes: string) => void
}

export default function CandidateNotesSection({
  candidateId,
  notes,
  onNotesChange,
}: CandidateNotesSectionProps) {
  const [savingNotes, setSavingNotes] = useState(false)

  const saveNotes = useCallback(async () => {
    if (!candidateId) return
    setSavingNotes(true)
    try {
      await fetch(`/api/candidates/${candidateId}/notes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      })
    } catch { /* silent */ }
    finally { setSavingNotes(false) }
  }, [candidateId, notes])

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="text-base">Notes privées</CardTitle>
      </CardHeader>
      <CardContent>
        <Textarea
          value={notes}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onNotesChange(e.target.value)}
          onBlur={saveNotes}
          placeholder="Vos notes sur ce candidat..."
          rows={3}
        />
        {savingNotes && <p className="mt-1 text-xs text-muted-foreground">Sauvegarde...</p>}
      </CardContent>
    </Card>
  )
}
