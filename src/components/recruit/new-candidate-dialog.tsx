import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Upload, X, CheckCircle } from 'lucide-react'

interface Role {
  id: string
  label: string
  categoryIds: string[]
  createdBy: string
  hasPoste: boolean
}

interface CatalogCategory {
  id: string
  label: string
  emoji: string
  skills?: { id: string; label: string }[]
}

type CreationResult = {
  id: string
  name: string
  suggestionsCount: number
  suggestions: Record<string, number> | null
  link: string
}

/** "+ Nouveau candidat" dialog — form, drag-drop CV, and post-creation
 *  success screen that shows the AI skills detected from the CV. Fetches
 *  roles + categories on open so the select is always fresh. */
export default function NewCandidateDialog({
  open, onOpenChange, onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: () => void
}) {
  const [roles, setRoles] = useState<Role[]>([])
  const [skillLabels, setSkillLabels] = useState<Record<string, string>>({})
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [selectedRoleId, setSelectedRoleId] = useState('')
  const [cvFile, setCvFile] = useState<File | null>(null)
  const [creating, setCreating] = useState(false)
  const [creationResult, setCreationResult] = useState<CreationResult | null>(null)

  const reset = useCallback(() => {
    setNewName(''); setNewEmail(''); setSelectedRoleId(''); setCvFile(null); setCreationResult(null)
  }, [])

  // Fetch roles + categories each time the dialog opens. Not huge payloads
  // and keeps the UI honest if roles were edited from elsewhere.
  useEffect(() => {
    if (!open) return
    fetch('/api/roles').then(r => r.ok ? r.json() : []).then(setRoles).catch(() => {})
    fetch('/api/catalog').then(r => r.ok ? r.json() : {}).then((data: { categories?: CatalogCategory[] } | CatalogCategory[]) => {
      const cats: CatalogCategory[] = Array.isArray(data) ? data : (data.categories ?? [])
      const labels: Record<string, string> = {}
      for (const cat of cats) for (const s of cat.skills ?? []) labels[s.id] = s.label
      setSkillLabels(labels)
    }).catch(() => {})
  }, [open])

  const handleCreate = async () => {
    if (!newName.trim() || !selectedRoleId) return
    setCreating(true)
    try {
      const formData = new FormData()
      formData.append('name', newName.trim())
      formData.append('roleId', selectedRoleId)
      if (newEmail.trim()) formData.append('email', newEmail.trim())
      if (cvFile) formData.append('cv', cvFile)
      const res = await fetch('/api/candidates', { method: 'POST', body: formData })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Erreur' }))
        throw new Error(body.error)
      }
      const data = await res.json()
      const link = `${window.location.origin}/evaluate/${data.id}`
      await navigator.clipboard.writeText(link).catch(() => {})
      onCreated?.()
      setCreationResult({
        id: data.id,
        name: newName.trim(),
        suggestionsCount: data.suggestionsCount ?? 0,
        suggestions: data.aiSuggestions ?? null,
        link,
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setCreating(false)
    }
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        {creationResult ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                Candidat créé
              </AlertDialogTitle>
            </AlertDialogHeader>
            <div className="space-y-3 py-2 overflow-hidden">
              <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
                <p className="font-medium">{creationResult.name}</p>
                {creationResult.suggestionsCount > 0 && creationResult.suggestions ? (
                  <>
                    <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-[#1B6179] dark:border-primary/30 dark:bg-primary/10 dark:text-primary">
                      ✨ {creationResult.suggestionsCount} compétences détectées et pré-remplies
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(creationResult.suggestions).map(([skillId, level]) => {
                        const skillLabel = skillLabels[skillId] ?? skillId
                        return (
                          <span key={skillId} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-[#1B6179] dark:text-primary">
                            {skillLabel} <span className="font-bold">L{level}</span>
                          </span>
                        )
                      })}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Aucune compétence détectée — le candidat remplira le formulaire manuellement.
                  </p>
                )}
              </div>
              <div className="rounded-md bg-muted/30 px-3 py-2 overflow-hidden">
                <p className="text-xs text-muted-foreground mb-1">Lien d'évaluation (copié)</p>
                <p className="text-xs font-mono truncate">{creationResult.link}</p>
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogAction onClick={() => handleOpenChange(false)}>Fermer</AlertDialogAction>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Ajouter un candidat</AlertDialogTitle>
              <AlertDialogDescription>
                Un lien d'évaluation sera généré et copié dans votre presse-papiers.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-4 py-2 overflow-hidden">
              <div>
                <Label htmlFor="new-cand-name">Nom *</Label>
                <Input id="new-cand-name" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Jean Dupont" />
              </div>
              <div>
                <Label htmlFor="new-cand-role">Rôle *</Label>
                <select
                  id="new-cand-role"
                  value={selectedRoleId}
                  onChange={e => setSelectedRoleId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">— Choisir un rôle —</option>
                  {roles.filter(r => r.createdBy === 'system' && r.hasPoste).length > 0 && (
                    <optgroup label="Postes recrutement">
                      {roles.filter(r => r.createdBy === 'system' && r.hasPoste).map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                    </optgroup>
                  )}
                  {roles.filter(r => r.createdBy !== 'system').length > 0 && (
                    <optgroup label="Rôles personnalisés">
                      {roles.filter(r => r.createdBy !== 'system').map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                    </optgroup>
                  )}
                </select>
              </div>
              <div>
                <Label htmlFor="new-cand-email">Email (optionnel)</Label>
                <Input id="new-cand-email" type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="jean@example.com" />
              </div>
              <div>
                <Label>CV (optionnel)</Label>
                {cvFile ? (
                  <div className="flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm overflow-hidden max-w-full">
                    <span className="truncate">{cvFile.name}</span>
                    <button type="button" onClick={() => setCvFile(null)} className="shrink-0 text-muted-foreground hover:text-foreground">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <label
                    className="flex cursor-pointer flex-col items-center gap-1 rounded-md border-2 border-dashed border-muted-foreground/25 px-3 py-4 text-center text-sm text-muted-foreground transition-colors hover:border-muted-foreground/50"
                    onDragOver={e => { e.preventDefault(); e.stopPropagation() }}
                    onDrop={e => {
                      e.preventDefault(); e.stopPropagation()
                      const f = e.dataTransfer.files[0]
                      if (!f) return
                      if (f.size > 10 * 1024 * 1024) { toast.error('Fichier trop volumineux (max 10 Mo)'); return }
                      if (!f.name.match(/\.(pdf|docx?)$/i)) { toast.error('Format non supporté — PDF ou DOCX uniquement'); return }
                      setCvFile(f)
                    }}
                  >
                    <Upload className="h-5 w-5" />
                    <span>Glisser un fichier ou <span className="font-medium text-foreground">cliquer</span></span>
                    <span className="text-xs">PDF ou DOCX · max 10 Mo</span>
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      className="hidden"
                      onChange={e => {
                        const f = e.target.files?.[0]
                        if (f && f.size <= 10 * 1024 * 1024) setCvFile(f)
                        else if (f) toast.error('Fichier trop volumineux (max 10 Mo)')
                      }}
                    />
                  </label>
                )}
                <p className="mt-1 text-xs text-muted-foreground">L'IA analysera le CV pour pré-remplir les compétences</p>
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={handleCreate} disabled={!newName.trim() || !selectedRoleId || creating}>
                {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {creating && cvFile ? 'Analyse du CV...' : creating ? 'Création...' : 'Créer'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}
