import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T') + 'Z')
  return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('fr-FR')
}
import AppHeader from '@/components/app-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Plus, Copy, Trash2, Loader2, Users, Eye, Settings, Upload, X, CheckCircle, Building2 } from 'lucide-react'

interface Candidate {
  id: string
  name: string
  role: string
  email: string | null
  createdBy: string
  createdAt: string
  expiresAt: string
  submittedAt: string | null
  hasReport: boolean
}

interface Role {
  id: string
  label: string
  categoryIds: string[]
  createdBy: string
}

interface CatalogCategory {
  id: string
  label: string
  emoji: string
}

export default function RecruitPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [roles, setRoles] = useState<Role[]>([])
  const [categories, setCategories] = useState<CatalogCategory[]>([])
  const [selectedRoleId, setSelectedRoleId] = useState('')
  const [cvFile, setCvFile] = useState<File | null>(null)
  const [showRoleManager, setShowRoleManager] = useState(false)
  const [newRoleLabel, setNewRoleLabel] = useState('')
  const [newRoleCategoryIds, setNewRoleCategoryIds] = useState<string[]>([])
  const [editingRole, setEditingRole] = useState<Role | null>(null)
  const [roleDialogOpen, setRoleDialogOpen] = useState(false)
  const [roleSaving, setRoleSaving] = useState(false)
  const [creationResult, setCreationResult] = useState<{ id: string; name: string; suggestionsCount: number; suggestions: Record<string, number> | null; link: string } | null>(null)

  const fetchCandidates = useCallback(async () => {
    try {
      const res = await fetch('/api/candidates')
      if (res.ok) setCandidates(await res.json())
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchCandidates() }, [fetchCandidates])

  const fetchRoles = useCallback(async () => {
    try {
      const res = await fetch('/api/roles')
      if (res.ok) setRoles(await res.json())
    } catch { /* ignore */ }
  }, [])

  const [skillLabels, setSkillLabels] = useState<Record<string, string>>({})

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/catalog')
      if (res.ok) {
        const data = await res.json()
        const cats = data.categories ?? data
        setCategories(cats)
        const labels: Record<string, string> = {}
        for (const cat of cats) {
          for (const skill of (cat.skills ?? [])) {
            labels[skill.id] = skill.label
          }
        }
        setSkillLabels(labels)
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { fetchRoles(); fetchCategories() }, [fetchRoles, fetchCategories])

  const handleCreate = async () => {
    if (!newName.trim() || !selectedRoleId) return
    setCreating(true)
    try {
      const formData = new FormData()
      formData.append('name', newName.trim())
      formData.append('roleId', selectedRoleId)
      if (newEmail.trim()) formData.append('email', newEmail.trim())
      if (cvFile) formData.append('cv', cvFile)
      const res = await fetch('/api/candidates', {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Erreur' }))
        throw new Error(body.error)
      }
      const data = await res.json()
      const link = `${window.location.origin}/evaluate/${data.id}`
      await navigator.clipboard.writeText(link).catch(() => {})
      fetchCandidates()
      // Show result screen with detected skills
      setCreationResult({ id: data.id, name: newName.trim(), suggestionsCount: data.suggestionsCount ?? 0, suggestions: data.aiSuggestions ?? null, link })
      setCreating(false)
      return // don't close dialog — show result
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Supprimer le candidat ${name} ?`)) return
    try {
      await fetch(`/api/candidates/${id}`, { method: 'DELETE' })
      toast.success('Candidat supprimé')
      fetchCandidates()
    } catch {
      toast.error('Erreur lors de la suppression')
    }
  }

  const copyLink = (id: string) => {
    const link = `${window.location.origin}/evaluate/${id}`
    navigator.clipboard.writeText(link)
    toast.success('Lien copié !')
  }

  function statusBadge(c: Candidate) {
    if (c.hasReport) return <Badge variant="default" className="bg-[#1B6179]">Analysé</Badge>
    if (c.submittedAt) return <Badge variant="default" className="bg-primary">Soumis</Badge>
    if (new Date(c.expiresAt) < new Date()) return <Badge variant="destructive">Expiré</Badge>
    return <Badge variant="secondary">En attente</Badge>
  }

  const handleSaveRole = async () => {
    if (!newRoleLabel.trim() || newRoleCategoryIds.length === 0) return
    setRoleSaving(true)
    try {
      const url = editingRole ? `/api/roles/${editingRole.id}` : '/api/roles'
      const method = editingRole ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: newRoleLabel.trim(), categoryIds: newRoleCategoryIds }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Erreur' }))
        throw new Error(body.error)
      }
      toast.success(editingRole ? 'Rôle mis à jour' : 'Rôle créé')
      setNewRoleLabel('')
      setNewRoleCategoryIds([])
      setEditingRole(null)
      setRoleDialogOpen(false)
      fetchRoles()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setRoleSaving(false)
    }
  }

  const handleDeleteRole = async (roleId: string, label: string) => {
    try {
      const res = await fetch(`/api/roles/${roleId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Erreur')
      toast.success(`Rôle "${label}" supprimé`)
      fetchRoles()
    } catch {
      toast.error('Erreur lors de la suppression')
    }
  }

  const openEditRole = (role: Role) => {
    setEditingRole(role)
    setNewRoleLabel(role.label)
    setNewRoleCategoryIds(role.categoryIds)
    setRoleDialogOpen(true)
  }

  const openNewRole = () => {
    setEditingRole(null)
    setNewRoleLabel('')
    setNewRoleCategoryIds([])
    setRoleDialogOpen(true)
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="mx-auto max-w-5xl px-4 pt-16 pb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Recrutement</h1>
            <p className="text-sm text-muted-foreground">
              Évaluez les candidats sur les mêmes compétences que l'équipe
            </p>
          </div>
          <div className="flex gap-2">
            <Link to="/recruit/pipeline">
              <Button variant="outline"><Building2 className="mr-2 h-4 w-4" /> Pipeline</Button>
            </Link>
          <AlertDialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setCreationResult(null) }}>
            <AlertDialogTrigger>
              <Button><Plus className="mr-2 h-4 w-4" /> Nouveau candidat</Button>
            </AlertDialogTrigger>
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
                    <AlertDialogAction onClick={() => {
                      setCreationResult(null)
                      setNewName('')
                      setNewEmail('')
                      setSelectedRoleId('')
                      setCvFile(null)
                      setDialogOpen(false)
                    }}>
                      Fermer
                    </AlertDialogAction>
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
                      <Label htmlFor="name">Nom *</Label>
                      <Input id="name" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Jean Dupont" />
                    </div>
                    <div>
                      <Label htmlFor="role">Rôle *</Label>
                      <select
                        id="role"
                        value={selectedRoleId}
                        onChange={e => setSelectedRoleId(e.target.value)}
                        className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        <option value="">— Choisir un rôle —</option>
                        {roles.filter(r => r.createdBy === 'system').length > 0 && (
                          <optgroup label="Postes recrutement">
                            {roles.filter(r => r.createdBy === 'system').map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
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
                      <Label htmlFor="email">Email (optionnel)</Label>
                      <Input id="email" type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="jean@example.com" />
                    </div>
                    <div>
                      <Label>CV (optionnel)</Label>
                      {cvFile ? (
                        <div className="flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm overflow-hidden max-w-full">
                          <span className="truncate">{cvFile.name}</span>
                          <button onClick={() => setCvFile(null)} className="shrink-0 text-muted-foreground hover:text-foreground">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <label
                          className="flex cursor-pointer flex-col items-center gap-1 rounded-md border-2 border-dashed border-muted-foreground/25 px-3 py-4 text-center text-sm text-muted-foreground transition-colors hover:border-muted-foreground/50"
                          onDragOver={e => { e.preventDefault(); e.stopPropagation() }}
                          onDrop={e => {
                            e.preventDefault()
                            e.stopPropagation()
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
        </div>

        {/* Role management */}
        <div className="mt-6 rounded-lg border bg-muted/30 p-4">
          <button
            onClick={() => setShowRoleManager(!showRoleManager)}
            className="flex w-full items-center gap-2 text-sm font-medium"
          >
            <Settings className="h-4 w-4" />
            Rôles personnalisés ({roles.filter(r => r.createdBy !== 'system').length})
            <span className="ml-auto text-xs text-muted-foreground">{showRoleManager ? '▾' : '▸'}</span>
          </button>
          {showRoleManager && (
            <div className="mt-3 space-y-2">
              {roles.filter(r => r.createdBy !== 'system').map(r => (
                <div key={r.id} className="flex items-center gap-2 rounded-md bg-background px-3 py-2 text-sm">
                  <span className="flex-1 font-medium">{r.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {r.categoryIds.map(cid => categories.find(c => c.id === cid)?.label).filter(Boolean).join(' · ')}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => openEditRole(r)} className="h-7 px-2 text-xs">Modifier</Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDeleteRole(r.id, r.label)} className="h-7 px-2 text-xs text-destructive">Supprimer</Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={openNewRole} className="mt-2">
                <Plus className="mr-1 h-3 w-3" /> Ajouter un rôle
              </Button>
            </div>
          )}
        </div>

        {/* Role create/edit dialog */}
        <AlertDialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{editingRole ? 'Modifier le rôle' : 'Nouveau rôle'}</AlertDialogTitle>
            </AlertDialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label>Nom du rôle</Label>
                <Input value={newRoleLabel} onChange={e => setNewRoleLabel(e.target.value)} placeholder="Développeur Full Stack" />
              </div>
              <div>
                <Label>Catégories associées</Label>
                <div className="mt-2 grid grid-cols-2 gap-1">
                  {categories.map(cat => (
                    <label key={cat.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted">
                      <input
                        type="checkbox"
                        checked={newRoleCategoryIds.includes(cat.id)}
                        onChange={e => {
                          if (e.target.checked) setNewRoleCategoryIds(prev => [...prev, cat.id])
                          else setNewRoleCategoryIds(prev => prev.filter(id => id !== cat.id))
                        }}
                      />
                      <span>{cat.emoji} {cat.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={handleSaveRole} disabled={!newRoleLabel.trim() || newRoleCategoryIds.length === 0 || roleSaving}>
                {roleSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {editingRole ? 'Enregistrer' : 'Créer'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
          </div>

        {loading ? (
          <div className="mt-12 flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : candidates.length === 0 ? (
          <Card className="mt-12">
            <CardContent className="p-12 text-center">
              <Users className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <h2 className="mt-4 text-lg font-medium">Aucun candidat</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Commencez par ajouter un candidat pour générer un lien d'évaluation.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-3 font-medium">Nom</th>
                  <th className="pb-3 font-medium">Poste</th>
                  <th className="pb-3 font-medium">Statut</th>
                  <th className="pb-3 font-medium">Créé le</th>
                  <th className="pb-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map(c => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="py-3">
                      <Link to={`/recruit/${c.id}`} className="hover:underline font-medium" onClick={(e) => e.stopPropagation()}>
                        {c.name}
                      </Link>
                    </td>
                    <td className="py-3 text-muted-foreground">{c.role}</td>
                    <td className="py-3">{statusBadge(c)}</td>
                    <td className="py-3 text-muted-foreground">
                      {formatDate(c.createdAt)}
                    </td>
                    <td className="py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => copyLink(c.id)} title="Copier le lien">
                          <Copy className="h-4 w-4" />
                        </Button>
                        {c.submittedAt && (
                          <Link to={`/recruit/${c.id}`} title="Voir le profil">
                            <Button variant="ghost" size="sm"><Eye className="h-4 w-4" /></Button>
                          </Link>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(c.id, c.name)} title="Supprimer">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
