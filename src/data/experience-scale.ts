export interface ExperienceLevel {
  value: number
  label: string
  shortLabel: string
}

export const experienceScale: ExperienceLevel[] = [
  { value: 0, label: 'Never', shortLabel: 'Never' },
  { value: 1, label: 'Less than 6 months', shortLabel: '<6mo' },
  { value: 2, label: '6 months \u2013 2 years', shortLabel: '6m\u20132y' },
  { value: 3, label: '2 \u2013 5 years', shortLabel: '2\u20135y' },
  { value: 4, label: '5+ years', shortLabel: '5+y' },
]
