/**
 * Stage-filter helper extracted out of recruit-pipeline-page so the page
 * module can ship without `react-refresh/only-export-components` lint
 * errors (Fast Refresh requires component files to only export
 * components). Pure logic, unit-tested in isolation.
 */

export type PipelineStage = 'nouveaux' | 'evaluation' | 'entretiens' | 'decision'

export const STAGE_STATUSES: Record<PipelineStage, readonly string[]> = {
  nouveaux: ['postule', 'preselectionne'],
  evaluation: ['skill_radar_envoye', 'skill_radar_complete', 'aboro'],
  entretiens: ['entretien_1', 'entretien_2'],
  decision: ['proposition', 'embauche'],
}

export const STAGE_LABELS: Record<PipelineStage, string> = {
  nouveaux: 'Nouveaux',
  evaluation: 'Évaluation',
  entretiens: 'Entretiens',
  decision: 'Décision',
}

export const STAGE_ORDER: PipelineStage[] = ['nouveaux', 'evaluation', 'entretiens', 'decision']

export interface PipelineStageCounts {
  stages: Record<PipelineStage, number>
  activeTotal: number
  refuses: number
}

/** Returns true if the given statut passes the stage filter. `'all'` = no
 *  stage filter; `'refuses'` matches the refused-only bucket. */
export function statutMatchesStageFilter(
  statut: string | null | undefined,
  stage: PipelineStage | 'refuses' | 'all',
): boolean {
  if (stage === 'all') return true
  if (stage === 'refuses') return statut === 'refuse'
  return STAGE_STATUSES[stage].includes(statut ?? '')
}

export function countPipelineStages<T extends { statut: string | null | undefined }>(
  rows: readonly T[],
): PipelineStageCounts {
  const stages: Record<PipelineStage, number> = {
    nouveaux: 0,
    evaluation: 0,
    entretiens: 0,
    decision: 0,
  }
  let refuses = 0

  for (const row of rows) {
    const statut = row.statut ?? ''
    if (statut === 'refuse') {
      refuses++
      continue
    }
    for (const stage of STAGE_ORDER) {
      if (STAGE_STATUSES[stage].includes(statut)) {
        stages[stage]++
        break
      }
    }
  }

  return {
    stages,
    activeTotal: STAGE_ORDER.reduce((sum, stage) => sum + stages[stage], 0),
    refuses,
  }
}
