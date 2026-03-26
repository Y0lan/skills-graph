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
import { Plus, Copy, Trash2, Loader2, Users, Eye } from 'lucide-react'

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

export default function RecruitPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)

  const fetchCandidates = useCallback(async () => {
    try {
      const res = await fetch('/api/candidates')
      if (res.ok) setCandidates(await res.json())
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchCandidates() }, [fetchCandidates])

  const handleCreate = async () => {
    if (!newName.trim() || !newRole.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), role: newRole.trim(), email: newEmail.trim() || undefined }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Erreur' }))
        throw new Error(body.error)
      }
      const data = await res.json()
      const link = `${window.location.origin}/evaluate/${data.id}`
      await navigator.clipboard.writeText(link).catch(() => {})
      if (data.emailSent) {
        toast.success('Candidat créé — lien copié + email envoyé !')
      } else {
        toast.success('Candidat créé — lien copié !')
      }
      setNewName('')
      setNewRole('')
      setNewEmail('')
      setDialogOpen(false)
      fetchCandidates()
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
    if (c.hasReport) return <Badge variant="default" className="bg-green-600">Analysé</Badge>
    if (c.submittedAt) return <Badge variant="default" className="bg-blue-600">Soumis</Badge>
    if (new Date(c.expiresAt) < new Date()) return <Badge variant="destructive">Expiré</Badge>
    return <Badge variant="secondary">En attente</Badge>
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
          <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <AlertDialogTrigger>
              <Button><Plus className="mr-2 h-4 w-4" /> Nouveau candidat</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Ajouter un candidat</AlertDialogTitle>
                <AlertDialogDescription>
                  Un lien d'évaluation sera généré et copié dans votre presse-papiers.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-4 py-2">
                <div>
                  <Label htmlFor="name">Nom *</Label>
                  <Input id="name" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Jean Dupont" />
                </div>
                <div>
                  <Label htmlFor="role">Poste visé *</Label>
                  <Input id="role" value={newRole} onChange={e => setNewRole(e.target.value)} placeholder="Développeur Frontend" />
                </div>
                <div>
                  <Label htmlFor="email">Email (optionnel)</Label>
                  <Input id="email" type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="jean@example.com" />
                </div>
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction onClick={handleCreate} disabled={!newName.trim() || !newRole.trim() || creating}>
                  {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Créer
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
                    <td className="py-3 font-medium">{c.name}</td>
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
