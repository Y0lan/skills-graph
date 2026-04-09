import { Router } from 'express'
import { getRoles, createRole, updateRole, softDeleteRole } from '../lib/db.js'
import { requireLead } from '../middleware/require-lead.js'
import { getSkillCategories } from '../lib/catalog.js'
import { getUser } from '../lib/types.js'

function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function validateCategoryIds(categoryIds: string[]): string | null {
  const validIds = new Set(getSkillCategories().map(c => c.id))
  const invalid = categoryIds.filter(id => !validIds.has(id))
  if (invalid.length > 0) return `Catégories inconnues: ${invalid.join(', ')}`
  return null
}

export const rolesRouter = Router()

rolesRouter.use(requireLead)

// List all active roles
rolesRouter.get('/', (_req, res) => {
  const roles = getRoles()
  res.json(roles)
})

// Create role
rolesRouter.post('/', (req, res) => {
  const { label, categoryIds } = req.body

  if (!label || typeof label !== 'string' || !label.trim()) {
    res.status(400).json({ error: 'Le libellé est requis' })
    return
  }
  if (!Array.isArray(categoryIds) || categoryIds.length === 0) {
    res.status(400).json({ error: 'Au moins une catégorie est requise' })
    return
  }
  const catError = validateCategoryIds(categoryIds)
  if (catError) {
    res.status(400).json({ error: catError })
    return
  }

  const user = getUser(req)
  const slug = slugify(label.trim())
  if (!slug) {
    res.status(400).json({ error: 'Le libellé doit contenir au moins un caractère alphanumérique' })
    return
  }

  try {
    const role = createRole(slug, label.trim(), categoryIds, user.slug!)
    res.status(201).json(role)
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('UNIQUE constraint')) {
      res.status(409).json({ error: 'Un rôle avec ce nom existe déjà' })
      return
    }
    throw err
  }
})

// Update role
rolesRouter.put('/:id', (req, res) => {
  const { label, categoryIds } = req.body

  if (!label || typeof label !== 'string' || !label.trim()) {
    res.status(400).json({ error: 'Le libellé est requis' })
    return
  }
  if (!Array.isArray(categoryIds) || categoryIds.length === 0) {
    res.status(400).json({ error: 'Au moins une catégorie est requise' })
    return
  }
  const catError = validateCategoryIds(categoryIds)
  if (catError) {
    res.status(400).json({ error: catError })
    return
  }

  const role = updateRole(req.params.id, label.trim(), categoryIds)
  if (!role) {
    res.status(404).json({ error: 'Rôle introuvable' })
    return
  }
  res.json(role)
})

// Soft-delete role
rolesRouter.delete('/:id', (req, res) => {
  const deleted = softDeleteRole(req.params.id)
  if (!deleted) {
    res.status(404).json({ error: 'Rôle introuvable' })
    return
  }
  res.json({ ok: true })
})
