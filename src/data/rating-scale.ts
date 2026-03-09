export interface RatingLevel {
  value: number
  label: string
  shortLabel: string
  description: string
}

export const ratingScale: RatingLevel[] = [
  {
    value: 0,
    label: 'Unknown',
    shortLabel: '?',
    description: 'Never used / don\u2019t know it',
  },
  {
    value: 1,
    label: 'Awareness',
    shortLabel: '1',
    description: 'I know what it is, read about it',
  },
  {
    value: 2,
    label: 'Guided',
    shortLabel: '2',
    description: 'I can work on it with help',
  },
  {
    value: 3,
    label: 'Autonomous',
    shortLabel: '3',
    description: 'I can deliver features independently',
  },
  {
    value: 4,
    label: 'Advanced',
    shortLabel: '4',
    description: 'I can design solutions, mentor others',
  },
  {
    value: 5,
    label: 'Expert',
    shortLabel: '5',
    description: 'Team reference, defines standards',
  },
]

export const RATING_NOT_SUBMITTED = -1
export const RATING_SKIPPED = -2

export function getRatingLabel(value: number): string {
  if (value === RATING_SKIPPED) return 'Skipped'
  if (value === RATING_NOT_SUBMITTED) return 'Not submitted'
  return ratingScale.find((r) => r.value === value)?.label ?? 'Unknown'
}
