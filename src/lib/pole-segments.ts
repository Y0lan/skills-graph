import { useEffect, useMemo, useState } from 'react'
import type { RadarSegment } from '@/components/visx-radar-chart'
import { POLE_HEX, POLE_LABELS } from './constants'

/** Order in which poles appear on the radar when "Tous les pôles" is selected. */
export const POLE_ORDER = ['java_modernisation', 'fonctionnel', 'legacy'] as const

/**
 * Fetch the pole→category mapping once and cache it. Returns null until loaded.
 * Network-driven so admin edits to the catalog show up without a redeploy.
 */
export function usePoleMappings(): Record<string, string[]> | null {
  const [mappings, setMappings] = useState<Record<string, string[]> | null>(null)
  useEffect(() => {
    fetch('/api/catalog/pole-mappings')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setMappings(d) })
      .catch(() => {})
  }, [])
  return mappings
}

/**
 * Given a list of category ids and the pole mappings, return:
 *  - `order`: the same ids reordered so pole-exclusive categories cluster together
 *    (java/modernisation block, then fonctionnel, then legacy, then transverse).
 *  - `segments`: ordered runs of identical pole used by `<VisxRadarChart segments=…>`
 *    to paint the colored background sectors.
 *
 * A category is "exclusive" to a pole if it's listed under exactly one pole;
 * categories listed under 2+ poles fall into the transverse bucket.
 */
export function buildPoleLayout(
  categoryIds: string[],
  mappings: Record<string, string[]> | null,
): { order: string[]; segments: RadarSegment[] | undefined; catToPole: Map<string, string> } {
  if (!mappings) return { order: categoryIds, segments: undefined, catToPole: new Map() }

  const allCatIds = new Set(categoryIds)
  const catToPole = new Map<string, string>()
  const usedCats = new Set<string>()

  // Pass 1 — exclusive categories per pole, in POLE_ORDER.
  for (const pole of POLE_ORDER) {
    for (const catId of mappings[pole] ?? []) {
      if (!allCatIds.has(catId) || usedCats.has(catId)) continue
      const poles = Object.entries(mappings)
        .filter(([, ids]) => ids.includes(catId))
        .map(([p]) => p)
      if (poles.length === 1) {
        catToPole.set(catId, pole)
        usedCats.add(catId)
      }
    }
  }
  // Pass 2 — shared (in 2+ poles) → transverse.
  for (const pole of POLE_ORDER) {
    for (const catId of mappings[pole] ?? []) {
      if (!allCatIds.has(catId) || usedCats.has(catId)) continue
      catToPole.set(catId, '__transverse')
      usedCats.add(catId)
    }
  }
  // Pass 3 — anything still loose → transverse.
  for (const catId of categoryIds) {
    if (!usedCats.has(catId)) {
      catToPole.set(catId, '__transverse')
      usedCats.add(catId)
    }
  }

  const groupOrder = [...POLE_ORDER, '__transverse'] as const
  const order = [...categoryIds].sort((a, b) => {
    const pa = catToPole.get(a) ?? '__transverse'
    const pb = catToPole.get(b) ?? '__transverse'
    const oa = groupOrder.indexOf(pa as typeof groupOrder[number])
    const ob = groupOrder.indexOf(pb as typeof groupOrder[number])
    return (oa >= 0 ? oa : groupOrder.length) - (ob >= 0 ? ob : groupOrder.length)
  })

  // Build segments from consecutive runs of the same pole.
  const segs: RadarSegment[] = []
  if (order.length > 0) {
    let segStart = 0
    let currentPole = catToPole.get(order[0]) ?? '__transverse'
    for (let i = 1; i <= order.length; i++) {
      const pole = i < order.length ? (catToPole.get(order[i]) ?? '__transverse') : '__done'
      if (pole !== currentPole) {
        if (POLE_HEX[currentPole]) {
          segs.push({
            from: segStart,
            to: i,
            color: POLE_HEX[currentPole],
            label: currentPole === '__transverse' ? 'Transverse' : (POLE_LABELS[currentPole] ?? currentPole),
          })
        }
        segStart = i
        currentPole = pole
      }
    }
  }

  return {
    order,
    segments: segs.length > 0 ? segs : undefined,
    catToPole,
  }
}

/** Hook variant — pass category ids, get back the layout reactively. */
export function usePoleLayout(categoryIds: string[]): {
  order: string[]
  segments: RadarSegment[] | undefined
  catToPole: Map<string, string>
} {
  const mappings = usePoleMappings()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => buildPoleLayout(categoryIds, mappings), [categoryIds.join('|'), mappings])
}
