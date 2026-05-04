import { describe, it, expect } from 'vitest'
import { countPipelineStages, statutMatchesStageFilter } from '@/lib/pipeline-stage-filter'

describe('statutMatchesStageFilter', () => {
  it("returns true for every statut when stage is 'all'", () => {
    const statuts = ['postule', 'preselectionne', 'skill_radar_envoye', 'aboro', 'entretien_2', 'embauche', 'refuse', null, undefined]
    for (const s of statuts) {
      expect(statutMatchesStageFilter(s, 'all')).toBe(true)
    }
  })

  it('stage=nouveaux matches postule and preselectionne only', () => {
    expect(statutMatchesStageFilter('postule', 'nouveaux')).toBe(true)
    expect(statutMatchesStageFilter('preselectionne', 'nouveaux')).toBe(true)
    expect(statutMatchesStageFilter('skill_radar_envoye', 'nouveaux')).toBe(false)
    expect(statutMatchesStageFilter('refuse', 'nouveaux')).toBe(false)
  })

  it('stage=evaluation matches skill_radar_* and aboro', () => {
    expect(statutMatchesStageFilter('skill_radar_envoye', 'evaluation')).toBe(true)
    expect(statutMatchesStageFilter('skill_radar_complete', 'evaluation')).toBe(true)
    expect(statutMatchesStageFilter('aboro', 'evaluation')).toBe(true)
    expect(statutMatchesStageFilter('entretien_1', 'evaluation')).toBe(false)
    expect(statutMatchesStageFilter('postule', 'evaluation')).toBe(false)
  })

  it('stage=entretiens matches only entretien_1 and entretien_2', () => {
    expect(statutMatchesStageFilter('entretien_1', 'entretiens')).toBe(true)
    expect(statutMatchesStageFilter('entretien_2', 'entretiens')).toBe(true)
    expect(statutMatchesStageFilter('aboro', 'entretiens')).toBe(false)
    expect(statutMatchesStageFilter('proposition', 'entretiens')).toBe(false)
  })

  it('stage=decision matches proposition and embauche — NOT refuse', () => {
    expect(statutMatchesStageFilter('proposition', 'decision')).toBe(true)
    expect(statutMatchesStageFilter('embauche', 'decision')).toBe(true)
    // `refuse` is terminal but intentionally NOT in the decision stage —
    // it has its own separate chip so stage ratios stay honest.
    expect(statutMatchesStageFilter('refuse', 'decision')).toBe(false)
  })

  it("stage=refuses matches ONLY refuse", () => {
    expect(statutMatchesStageFilter('refuse', 'refuses')).toBe(true)
    expect(statutMatchesStageFilter('embauche', 'refuses')).toBe(false)
    expect(statutMatchesStageFilter('postule', 'refuses')).toBe(false)
  })

  it('null/undefined statut never matches any active stage', () => {
    expect(statutMatchesStageFilter(null, 'nouveaux')).toBe(false)
    expect(statutMatchesStageFilter(undefined, 'decision')).toBe(false)
    expect(statutMatchesStageFilter(null, 'refuses')).toBe(false)
  })
})

describe('countPipelineStages', () => {
  it('counts stages from the rows it receives, so UI shortcuts can be scoped by active filters', () => {
    const counts = countPipelineStages([
      { statut: 'postule', pole: 'legacy' },
      { statut: 'preselectionne', pole: 'legacy' },
      { statut: 'skill_radar_envoye', pole: 'java' },
      { statut: 'skill_radar_complete', pole: 'java' },
      { statut: 'aboro', pole: 'java' },
      { statut: 'entretien_1', pole: 'fonctionnel' },
      { statut: 'entretien_2', pole: 'fonctionnel' },
      { statut: 'proposition', pole: 'fonctionnel' },
      { statut: 'embauche', pole: 'fonctionnel' },
      { statut: 'refuse', pole: 'legacy' },
      { statut: null, pole: 'legacy' },
    ])

    expect(counts.stages).toEqual({
      nouveaux: 2,
      evaluation: 3,
      entretiens: 2,
      decision: 2,
    })
    expect(counts.activeTotal).toBe(9)
    expect(counts.refuses).toBe(1)
  })

  it('keeps zero-count stages explicit', () => {
    const counts = countPipelineStages([{ statut: 'skill_radar_complete' }])

    expect(counts.stages.nouveaux).toBe(0)
    expect(counts.stages.evaluation).toBe(1)
    expect(counts.stages.entretiens).toBe(0)
    expect(counts.stages.decision).toBe(0)
    expect(counts.refuses).toBe(0)
  })
})
