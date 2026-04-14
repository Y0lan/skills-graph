import { describe, it, expect } from 'vitest'

describe('shared category computation', () => {
  // Helper: given two members' category averages, compute shared category IDs
  function computeSharedCategories(
    aCategories: { categoryId: string; avgRank: number }[],
    bCategories: { categoryId: string; avgRank: number }[],
  ): string[] {
    const aRated = new Set(aCategories.filter(c => c.avgRank > 0).map(c => c.categoryId))
    const bRated = new Set(bCategories.filter(c => c.avgRank > 0).map(c => c.categoryId))
    return [...aRated].filter(id => bRated.has(id))
  }

  it('returns only categories where both members rated skills', () => {
    const memberA = [
      { categoryId: 'soft-skills-delivery', avgRank: 3.5 },
      { categoryId: 'backend-integration', avgRank: 4.0 },
      { categoryId: 'architecture-governance', avgRank: 2.0 },
    ]
    const memberB = [
      { categoryId: 'soft-skills-delivery', avgRank: 2.5 },
      { categoryId: 'analyse-fonctionnelle', avgRank: 3.0 },
      { categoryId: 'architecture-governance', avgRank: 3.5 },
    ]
    const shared = computeSharedCategories(memberA, memberB)
    expect(shared).toContain('soft-skills-delivery')
    expect(shared).toContain('architecture-governance')
    expect(shared).not.toContain('backend-integration')
    expect(shared).not.toContain('analyse-fonctionnelle')
    expect(shared).toHaveLength(2)
  })

  it('returns empty array when no overlap', () => {
    const memberA = [{ categoryId: 'legacy-ibmi-adelia', avgRank: 3.0 }]
    const memberB = [{ categoryId: 'analyse-fonctionnelle', avgRank: 3.0 }]
    expect(computeSharedCategories(memberA, memberB)).toHaveLength(0)
  })

  it('excludes categories with avgRank 0', () => {
    const memberA = [
      { categoryId: 'soft-skills-delivery', avgRank: 3.0 },
      { categoryId: 'backend-integration', avgRank: 0 },
    ]
    const memberB = [
      { categoryId: 'soft-skills-delivery', avgRank: 2.0 },
      { categoryId: 'backend-integration', avgRank: 0 },
    ]
    const shared = computeSharedCategories(memberA, memberB)
    expect(shared).toEqual(['soft-skills-delivery'])
  })

  it('java_modernisation vs fonctionnel shares exactly 3 default categories', () => {
    // These are the required categories shared between the two poles
    // architecture-governance, soft-skills-delivery, domain-knowledge
    // core-engineering is NOT in fonctionnel
    const javaRequired = [
      'core-engineering', 'backend-integration', 'frontend-ui',
      'platform-engineering', 'observability-reliability', 'security-compliance',
      'ai-engineering', 'qa-test-engineering',
      'architecture-governance', 'soft-skills-delivery', 'domain-knowledge',
    ]
    const fonctionnelRequired = [
      'analyse-fonctionnelle', 'project-management-pmo', 'change-management-training',
      'design-ux', 'data-engineering-governance', 'management-leadership',
      'architecture-governance', 'soft-skills-delivery', 'domain-knowledge',
    ]
    const memberA = javaRequired.map(id => ({ categoryId: id, avgRank: 3.0 }))
    const memberB = fonctionnelRequired.map(id => ({ categoryId: id, avgRank: 3.0 }))
    const shared = computeSharedCategories(memberA, memberB)
    expect(shared).toHaveLength(3)
    expect(shared).toContain('architecture-governance')
    expect(shared).toContain('soft-skills-delivery')
    expect(shared).toContain('domain-knowledge')
    expect(shared).not.toContain('core-engineering')
  })
})

describe('declined vs skipped categories', () => {
  it('declined and skipped are distinct arrays', () => {
    const formData = {
      skippedCategories: ['frontend-ui'],
      declinedCategories: ['analyse-fonctionnelle', 'design-ux'],
    }
    expect(formData.skippedCategories).not.toEqual(formData.declinedCategories)
    expect(formData.skippedCategories).toHaveLength(1)
    expect(formData.declinedCategories).toHaveLength(2)
  })

  it('a category can be declined but not skipped', () => {
    const declined = new Set(['analyse-fonctionnelle'])
    const skipped = new Set(['frontend-ui'])
    expect(declined.has('analyse-fonctionnelle')).toBe(true)
    expect(skipped.has('analyse-fonctionnelle')).toBe(false)
  })
})

describe('non-pole category grouping', () => {
  const poleMapping: Record<string, string[]> = {
    legacy: ['legacy-ibmi-adelia', 'core-engineering', 'architecture-governance', 'soft-skills-delivery', 'domain-knowledge'],
    java_modernisation: ['core-engineering', 'backend-integration', 'frontend-ui', 'platform-engineering', 'observability-reliability', 'security-compliance', 'ai-engineering', 'qa-test-engineering', 'architecture-governance', 'soft-skills-delivery', 'domain-knowledge'],
    fonctionnel: ['analyse-fonctionnelle', 'project-management-pmo', 'change-management-training', 'design-ux', 'data-engineering-governance', 'management-leadership', 'architecture-governance', 'soft-skills-delivery', 'domain-knowledge'],
  }

  function getNonPoleCategories(userPole: string, allCategoryIds: string[]): { pole: string; categoryIds: string[] }[] {
    const userCats = new Set(poleMapping[userPole] ?? [])
    const catToPoles = new Map<string, string[]>()
    for (const [pole, cats] of Object.entries(poleMapping)) {
      for (const cat of cats) {
        const existing = catToPoles.get(cat) ?? []
        existing.push(pole)
        catToPoles.set(cat, existing)
      }
    }
    const byPole = new Map<string, string[]>()
    const transverse: string[] = []
    for (const catId of allCategoryIds) {
      if (userCats.has(catId)) continue
      const poles = catToPoles.get(catId)
      if (!poles || poles.length === 0) {
        transverse.push(catId)
      } else {
        const sourcePole = poles.find(p => p !== userPole) ?? poles[0]
        const existing = byPole.get(sourcePole) ?? []
        existing.push(catId)
        byPole.set(sourcePole, existing)
      }
    }
    const groups: { pole: string; categoryIds: string[] }[] = []
    for (const [pole, cats] of byPole) groups.push({ pole, categoryIds: cats })
    if (transverse.length > 0) groups.push({ pole: 'transverse', categoryIds: transverse })
    return groups
  }

  it('excludes user pole categories', () => {
    const all = [...new Set(Object.values(poleMapping).flat()), 'infrastructure-systems-network']
    const groups = getNonPoleCategories('java_modernisation', all)
    const allNonPole = groups.flatMap(g => g.categoryIds)
    for (const cat of poleMapping.java_modernisation) {
      expect(allNonPole).not.toContain(cat)
    }
  })

  it('places infrastructure-systems-network in transverse', () => {
    const all = [...new Set(Object.values(poleMapping).flat()), 'infrastructure-systems-network']
    const groups = getNonPoleCategories('java_modernisation', all)
    const transverse = groups.find(g => g.pole === 'transverse')
    expect(transverse).toBeDefined()
    expect(transverse!.categoryIds).toContain('infrastructure-systems-network')
  })

  it('groups fonctionnel-specific categories under fonctionnel', () => {
    const all = [...new Set(Object.values(poleMapping).flat())]
    const groups = getNonPoleCategories('java_modernisation', all)
    const fonctionnel = groups.find(g => g.pole === 'fonctionnel')
    expect(fonctionnel).toBeDefined()
    expect(fonctionnel!.categoryIds).toContain('analyse-fonctionnelle')
    expect(fonctionnel!.categoryIds).toContain('design-ux')
  })
})
