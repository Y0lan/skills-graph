export interface ExperienceLevel {
  value: number
  label: string
  shortLabel: string
}

export const experienceScale: ExperienceLevel[] = [
  { value: 0, label: 'Jamais', shortLabel: 'Jamais' },
  { value: 1, label: 'Moins de 6 mois', shortLabel: '<6m' },
  { value: 2, label: '6 mois \u2013 2 ans', shortLabel: '6m\u20132a' },
  { value: 3, label: '2 \u2013 5 ans', shortLabel: '2\u20135a' },
  { value: 4, label: '5+ ans', shortLabel: '5+a' },
]
