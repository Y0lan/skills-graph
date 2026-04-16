import { describe, it, expect } from 'vitest'
import {
  TRANSITION_MAP,
  SKIPPABLE_STEPS,
  NOTES_REQUIRED,
  getAllowedTransitions,
  isSkipTransition,
  getSkippedSteps,
} from '../lib/state-machine.js'

describe('State Machine', () => {
  // ─── getAllowedTransitions ───────────────────────────────────
  describe('getAllowedTransitions', () => {
    it('returns correct transitions for postule', () => {
      expect(getAllowedTransitions('postule')).toEqual(['preselectionne', 'refuse'])
    })

    it('returns correct transitions for preselectionne', () => {
      expect(getAllowedTransitions('preselectionne')).toEqual(['skill_radar_envoye', 'entretien_1', 'refuse'])
    })

    it('returns correct transitions for skill_radar_envoye', () => {
      expect(getAllowedTransitions('skill_radar_envoye')).toEqual(['skill_radar_complete', 'refuse'])
    })

    it('returns correct transitions for skill_radar_complete', () => {
      expect(getAllowedTransitions('skill_radar_complete')).toEqual(['entretien_1', 'refuse'])
    })

    it('returns correct transitions for entretien_1', () => {
      expect(getAllowedTransitions('entretien_1')).toEqual(['aboro', 'entretien_2', 'refuse'])
    })

    it('returns correct transitions for aboro', () => {
      expect(getAllowedTransitions('aboro')).toEqual(['entretien_2', 'refuse'])
    })

    it('returns correct transitions for entretien_2', () => {
      expect(getAllowedTransitions('entretien_2')).toEqual(['proposition', 'refuse'])
    })

    it('returns correct transitions for proposition', () => {
      expect(getAllowedTransitions('proposition')).toEqual(['embauche', 'refuse'])
    })

    it('returns empty array for embauche (terminal state)', () => {
      expect(getAllowedTransitions('embauche')).toEqual([])
    })

    it('returns empty array for refuse (terminal state)', () => {
      expect(getAllowedTransitions('refuse')).toEqual([])
    })

    it('returns empty array for unknown status', () => {
      expect(getAllowedTransitions('nonexistent')).toEqual([])
    })
  })

  // ─── Invalid transitions ────────────────────────────────────
  describe('invalid transitions', () => {
    it('postule cannot go directly to embauche', () => {
      const allowed = getAllowedTransitions('postule')
      expect(allowed).not.toContain('embauche')
    })

    it('postule cannot go directly to entretien_1', () => {
      const allowed = getAllowedTransitions('postule')
      expect(allowed).not.toContain('entretien_1')
    })

    it('preselectionne cannot go directly to embauche', () => {
      const allowed = getAllowedTransitions('preselectionne')
      expect(allowed).not.toContain('embauche')
    })

    it('skill_radar_envoye cannot go directly to entretien_1', () => {
      const allowed = getAllowedTransitions('skill_radar_envoye')
      expect(allowed).not.toContain('entretien_1')
    })

    it('entretien_1 cannot go directly to embauche', () => {
      const allowed = getAllowedTransitions('entretien_1')
      expect(allowed).not.toContain('embauche')
    })

    it('entretien_2 cannot go backwards to entretien_1', () => {
      const allowed = getAllowedTransitions('entretien_2')
      expect(allowed).not.toContain('entretien_1')
    })
  })

  // ─── Refuse from every status ───────────────────────────────
  describe('refuse from every status', () => {
    const allStatuts = Object.keys(TRANSITION_MAP)

    for (const statut of allStatuts) {
      if (statut === 'embauche' || statut === 'refuse') {
        it(`${statut} cannot transition to refuse (terminal state)`, () => {
          expect(getAllowedTransitions(statut)).not.toContain('refuse')
        })
      } else {
        it(`${statut} can transition to refuse`, () => {
          expect(getAllowedTransitions(statut)).toContain('refuse')
        })
      }
    }
  })

  // ─── isSkipTransition ───────────────────────────────────────
  describe('isSkipTransition', () => {
    it('preselectionne → entretien_1 is a direct transition, not a skip', () => {
      expect(isSkipTransition('preselectionne', 'entretien_1')).toBe(false)
    })

    it('entretien_1 → entretien_2 is a direct transition, not a skip', () => {
      expect(isSkipTransition('entretien_1', 'entretien_2')).toBe(false)
    })

    it('entretien_1 → proposition is a valid skip (skips aboro + entretien_2)', () => {
      expect(isSkipTransition('entretien_1', 'proposition')).toBe(true)
    })

    it('preselectionne → entretien_1 via skip_radar is a valid skip', () => {
      // preselectionne → [skill_radar_envoye] → ... → entretien_1
      // skill_radar_envoye is skippable, but skill_radar_complete is not
      // Actually preselectionne → entretien_1 is a direct transition
      expect(isSkipTransition('preselectionne', 'entretien_1')).toBe(false)
    })

    it('skill_radar_complete → aboro skips nothing (entretien_1 is not skippable)', () => {
      expect(isSkipTransition('skill_radar_complete', 'aboro')).toBe(false)
    })

    it('refuse is never a skip target', () => {
      expect(isSkipTransition('postule', 'refuse')).toBe(false)
      expect(isSkipTransition('entretien_1', 'refuse')).toBe(false)
    })

    it('backwards transitions are not skips', () => {
      expect(isSkipTransition('entretien_2', 'postule')).toBe(false)
    })

    it('same-status transition is not a skip', () => {
      expect(isSkipTransition('postule', 'postule')).toBe(false)
    })

    it('postule → embauche is not a valid skip (non-skippable steps in between)', () => {
      expect(isSkipTransition('postule', 'embauche')).toBe(false)
    })
  })

  // ─── getSkippedSteps ────────────────────────────────────────
  describe('getSkippedSteps', () => {
    it('entretien_1 → proposition returns [aboro, entretien_2]', () => {
      expect(getSkippedSteps('entretien_1', 'proposition')).toEqual(['aboro', 'entretien_2'])
    })

    it('entretien_1 → entretien_2 returns [aboro]', () => {
      expect(getSkippedSteps('entretien_1', 'entretien_2')).toEqual(['aboro'])
    })

    it('postule → preselectionne returns [] (adjacent steps)', () => {
      expect(getSkippedSteps('postule', 'preselectionne')).toEqual([])
    })

    it('preselectionne → skill_radar_complete returns [skill_radar_envoye]', () => {
      expect(getSkippedSteps('preselectionne', 'skill_radar_complete')).toEqual(['skill_radar_envoye'])
    })

    it('postule → embauche returns all intermediate steps', () => {
      expect(getSkippedSteps('postule', 'embauche')).toEqual([
        'preselectionne',
        'skill_radar_envoye',
        'skill_radar_complete',
        'entretien_1',
        'aboro',
        'entretien_2',
        'proposition',
      ])
    })

    it('returns empty for same status', () => {
      expect(getSkippedSteps('postule', 'postule')).toEqual([])
    })
  })

  // ─── Terminal states ────────────────────────────────────────
  describe('terminal states', () => {
    it('embauche has no outgoing transitions', () => {
      expect(TRANSITION_MAP['embauche']).toEqual([])
      expect(getAllowedTransitions('embauche')).toHaveLength(0)
    })

    it('refuse has no outgoing transitions', () => {
      expect(TRANSITION_MAP['refuse']).toEqual([])
      expect(getAllowedTransitions('refuse')).toHaveLength(0)
    })
  })

  // ─── SKIPPABLE_STEPS and NOTES_REQUIRED ─────────────────────
  describe('constants', () => {
    it('SKIPPABLE_STEPS contains aboro, entretien_2, skill_radar_envoye', () => {
      expect(SKIPPABLE_STEPS.has('aboro')).toBe(true)
      expect(SKIPPABLE_STEPS.has('entretien_2')).toBe(true)
      expect(SKIPPABLE_STEPS.has('skill_radar_envoye')).toBe(true)
    })

    it('SKIPPABLE_STEPS does not contain non-skippable steps', () => {
      expect(SKIPPABLE_STEPS.has('postule')).toBe(false)
      expect(SKIPPABLE_STEPS.has('preselectionne')).toBe(false)
      expect(SKIPPABLE_STEPS.has('entretien_1')).toBe(false)
      expect(SKIPPABLE_STEPS.has('embauche')).toBe(false)
    })

    it('NOTES_REQUIRED contains refuse and embauche', () => {
      expect(NOTES_REQUIRED.has('refuse')).toBe(true)
      expect(NOTES_REQUIRED.has('embauche')).toBe(true)
    })

    it('NOTES_REQUIRED does not contain other statuses', () => {
      expect(NOTES_REQUIRED.has('postule')).toBe(false)
      expect(NOTES_REQUIRED.has('entretien_1')).toBe(false)
    })
  })

  // ─── Every valid transition in TRANSITION_MAP ───────────────
  describe('all valid transitions', () => {
    for (const [from, targets] of Object.entries(TRANSITION_MAP)) {
      for (const to of targets) {
        it(`${from} → ${to} is a valid direct transition`, () => {
          const allowed = getAllowedTransitions(from)
          expect(allowed).toContain(to)
        })
      }
    }
  })
})
