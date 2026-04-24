import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Plus } from 'lucide-react'

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
}

/** Role management — two-bucket view: system roles (read-only) and
 *  custom roles (CRUD). Embedded edit dialog. Fetches roles + categories
 *  once on mount and refetches after each CRUD op. */
export default function RoleManagerPanel({ onCountChange }: { onCountChange?: (customCount: number) => void }) {
  const [roles, setRoles] = useState<Role[]>([])
  const [categories, setCategories] = useState<CatalogCategory[]>([])
  const [editingRole, setEditingRole] = useState<Role | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newRoleLabel, setNewRoleLabel] = useState('')
  const [newRoleCategoryIds, setNewRoleCategoryIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const fetchRoles = useCallback(() => {
    fetch('/api/roles').then(r => r.ok ? r.json() : []).then((rs: Role[]) => {
      setRoles(rs)
      onCountChange?.(rs.filter(r => r.createdBy !== 'system').length)
    }).catch(() => {})
  }, [onCountChange])

  useEffect(() => {
    fetchRoles()
    fetch('/api/catalog').then(r => r.ok ? r.json() : {}).then((data: { categories?: CatalogCategory[] } | CatalogCategory[]) => {
      setCategories(Array.isArray(data) ? data : (data.categories ?? []))
    }).catch(() => {})
  }, [fetchRoles])

  const openNew = () => {
    setEditingRole(null); setNewRoleLabel(''); setNewRoleCategoryIds([]); setDialogOpen(true)
  }
  const openEdit = (role: Role) => {
    setEditingRole(role); setNewRoleLabel(role.label); setNewRoleCategoryIds(role.categoryIds); setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!newRoleLabel.trim() || newRoleCategoryIds.length === 0) return
    setSaving(true)
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
      setDialogOpen(false); setEditingRole(null); setNewRoleLabel(''); setNewRoleCategoryIds([])
      fetchRoles()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (roleId: string, label: string) => {
    try {
      const res = await fetch(`/api/roles/${roleId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Erreur')
      toast.success(`Rôle "${label}" supprimé`)
      fetchRoles()
    } catch {
      toast.error('Erreur lors de la suppression')
    }
  }

  return (
    <div className="space-y-3">
      {/* System roles — read-only, pre-wired categories */}
      {roles.filter(r => r.createdBy === 'system' && r.hasPoste).length > 0 && (
        <div className="rounded-md border border-border/50 bg-muted/20 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">Postes recrutement</span>
            <span className="text-[11px] text-muted-foreground">Catégories pré-sélectionnées · lecture seule</span>
          </div>
          <div className="space-y-1.5">
            {roles.filter(r => r.createdBy === 'system' && r.hasPoste).map(r => (
              <div key={r.id} className="flex items-start gap-3 rounded-md bg-background px-3 py-2 text-sm">
                <span className="font-medium shrink-0 w-56 truncate" title={r.label}>{r.label}</span>
                <div className="flex flex-wrap gap-1 flex-1 min-w-0">
                  {r.categoryIds.map(cid => {
                    const cat = categories.find(c => c.id === cid)
                    if (!cat) return null
                    return (
                      <Badge key={cid} variant="secondary" className="text-[10px] font-normal">
                        {cat.emoji} {cat.label}
                      </Badge>
                    )
                  })}
                  {r.categoryIds.length === 0 && (
                    <span className="text-xs text-muted-foreground italic">aucune catégorie</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Custom roles — editable */}
      <div className="rounded-md border border-border/50 bg-muted/20 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium">Rôles personnalisés</span>
          <Button variant="outline" size="sm" onClick={openNew} className="h-7">
            <Plus className="mr-1 h-3 w-3" /> Ajouter un rôle
          </Button>
        </div>
        {roles.filter(r => r.createdBy !== 'system').length === 0 ? (
          <p className="py-2 text-xs text-muted-foreground">
            Aucun rôle personnalisé. Cliquez sur « Ajouter un rôle » pour créer un poste sur mesure.
          </p>
        ) : (
          <div className="space-y-1.5">
            {roles.filter(r => r.createdBy !== 'system').map(r => (
              <div key={r.id} className="flex items-start gap-3 rounded-md bg-background px-3 py-2 text-sm">
                <span className="font-medium shrink-0 w-56 truncate" title={r.label}>{r.label}</span>
                <div className="flex flex-wrap gap-1 flex-1 min-w-0">
                  {r.categoryIds.map(cid => {
                    const cat = categories.find(c => c.id === cid)
                    if (!cat) return null
                    return (
                      <Badge key={cid} variant="secondary" className="text-[10px] font-normal">
                        {cat.emoji} {cat.label}
                      </Badge>
                    )
                  })}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(r)} className="h-7 px-2 text-xs">Modifier</Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(r.id, r.label)} className="h-7 px-2 text-xs text-destructive">Supprimer</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Role create/edit dialog */}
      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent size="xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{editingRole ? 'Modifier le rôle' : 'Nouveau rôle'}</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Nom du rôle</Label>
              <Input value={newRoleLabel} onChange={e => setNewRoleLabel(e.target.value)} placeholder="Développeur Full Stack" />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label>Catégories associées</Label>
                <span className="text-[11px] text-muted-foreground">
                  {newRoleCategoryIds.length}/{categories.length} sélectionnée{newRoleCategoryIds.length > 1 ? 's' : ''}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {categories.map(cat => {
                  const checked = newRoleCategoryIds.includes(cat.id)
                  return (
                    <label
                      key={cat.id}
                      className={`flex items-center gap-2 rounded border px-2 py-1.5 text-xs cursor-pointer transition-colors ${checked ? 'border-primary/50 bg-primary/5' : 'border-transparent hover:bg-muted'}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={e => {
                          if (e.target.checked) setNewRoleCategoryIds(prev => [...prev, cat.id])
                          else setNewRoleCategoryIds(prev => prev.filter(id => id !== cat.id))
                        }}
                      />
                      <span className="truncate" title={cat.label}>{cat.emoji} {cat.label}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleSave} disabled={!newRoleLabel.trim() || newRoleCategoryIds.length === 0 || saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {editingRole ? 'Enregistrer' : 'Créer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
