import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Loader2 } from 'lucide-react'

export interface PosteDescriptionDialogProps {
  open: boolean
  onClose: () => void
  posteId: string
  posteTitre: string
  currentDescription: string | null
  onSaved: (newDescription: string | null) => void
}

const MAX_CHARS = 20000

/**
 * Editor for a poste's fiche de poste description. The text is fed to the
 * role-aware CV extraction prompt in Phase 3 via PosteContext.description.
 * Kept deliberately minimal — plain textarea, markdown allowed but not
 * rendered. Recruiter pastes the full job description once per poste.
 */
export default function PosteDescriptionDialog({
  open,
  onClose,
  posteId,
  posteTitre,
  currentDescription,
  onSaved,
}: PosteDescriptionDialogProps) {
  const [value, setValue] = useState(currentDescription ?? '')
  const [saving, setSaving] = useState(false)
  const initial = useRef(currentDescription ?? '')

  useEffect(() => {
    if (open) {
      setValue(currentDescription ?? '')
      initial.current = currentDescription ?? ''
    }
  }, [open, currentDescription])

  const dirty = value !== initial.current
  const tooLong = value.length > MAX_CHARS

  const handleSave = async () => {
    if (!dirty || tooLong || saving) return
    setSaving(true)
    try {
      const res = await fetch(`/api/recruitment/postes/${posteId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: value }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Erreur inconnue' }))
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }
      const body = await res.json()
      onSaved(body.description ?? null)
      toast.success('Fiche de poste enregistrée')
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Échec de l’enregistrement')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="w-[95vw] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Fiche de poste
            <span className="text-sm font-normal text-muted-foreground">— {posteTitre}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Collez la fiche de poste complète ici. Le contenu est utilisé par l’IA pour calibrer les scores et questions en fonction du rôle."
            className="min-h-[320px] font-mono text-xs"
            autoFocus
          />
          <div className={`flex items-center justify-between text-xs ${tooLong ? 'text-red-600' : 'text-muted-foreground'}`}>
            <span>Markdown autorisé. Non rendu — envoyé tel quel à l’IA.</span>
            <span>{value.length.toLocaleString('fr-FR')} / {MAX_CHARS.toLocaleString('fr-FR')}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Annuler</Button>
          <Button onClick={handleSave} disabled={!dirty || tooLong || saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
