export type Pole = 'legacy' | 'java_modernisation' | 'fonctionnel'

export interface TeamMember {
  slug: string
  name: string
  role: string
  team: string
  pole: Pole | null
}

export const teamMembers: TeamMember[] = [
  // Ingénierie Technique
  {
    slug: 'yolan-maldonado',
    name: 'Yolan M.',
    role: 'Architecte Technique Logiciel',
    team: 'Ingénierie Technique',
    pole: 'java_modernisation',
  },
  {
    slug: 'alexandre-thomas',
    name: 'Alexandre T.',
    role: 'Architecte Technique Logiciel',
    team: 'Ingénierie Technique',
    pole: 'java_modernisation',
  },
  {
    slug: 'alan-huitel',
    name: 'Alan H.',
    role: 'Ingénieur DevOps',
    team: 'Ingénierie Technique',
    pole: 'java_modernisation',
  },
  {
    slug: 'pierre-mathieu-barras',
    name: 'Pierre-Mathieu B.',
    role: 'Ingénieur DevOps / Développeur',
    team: 'Ingénierie Technique',
    pole: 'java_modernisation',
  },
  {
    slug: 'andy-malo',
    name: 'Andy M.',
    role: 'Ingénieur Data',
    team: 'Ingénierie Technique',
    pole: 'java_modernisation',
  },

  // Développement
  {
    slug: 'steven-nguyen',
    name: 'Steven N.',
    role: 'Développeur Full Stack',
    team: 'Développement',
    pole: 'java_modernisation',
  },
  {
    slug: 'matthieu-alcime',
    name: 'Matthieu A.',
    role: 'Développeur Full Stack',
    team: 'Développement',
    pole: 'java_modernisation',
  },
  {
    slug: 'martin-vallet',
    name: 'Martin V.',
    role: 'Développeur Full Stack',
    team: 'Développement',
    pole: 'java_modernisation',
  },
  {
    slug: 'nicole-nguon',
    name: 'Nicole N.',
    role: 'Développeuse Full Stack',
    team: 'Développement',
    pole: 'java_modernisation',
  },

  // QA & Automatisation
  {
    slug: 'bethlehem-mengistu',
    name: 'Bethlehem M.',
    role: 'Ingénieure QA',
    team: 'QA & Automatisation',
    pole: 'java_modernisation',
  },

  // Business Analysts
  {
    slug: 'nicolas-dufillot',
    name: 'Nicolas D.',
    role: 'Business Analyst',
    team: 'Analyse Fonctionnelle',
    pole: 'fonctionnel',
  },
  {
    slug: 'nicolas-eppe',
    name: 'Nicolas E.',
    role: 'Business Analyst',
    team: 'Analyse Fonctionnelle',
    pole: 'fonctionnel',
  },
  {
    slug: 'leila-benakezouh',
    name: 'Leila B.',
    role: 'Business Analyst',
    team: 'Analyse Fonctionnelle',
    pole: 'fonctionnel',
  },
  {
    slug: 'sonalie-taconet',
    name: 'Sonalie T.',
    role: 'Business Analyst',
    team: 'Analyse Fonctionnelle',
    pole: 'fonctionnel',
  },
  {
    slug: 'amine-bouali',
    name: 'Amine B.',
    role: 'Business Analyst',
    team: 'Analyse Fonctionnelle',
    pole: 'fonctionnel',
  },
  {
    slug: 'audrey-queau',
    name: 'Audrey Q.',
    role: 'Business Analyst',
    team: 'Analyse Fonctionnelle',
    pole: 'fonctionnel',
  },

  // Management
  {
    slug: 'pierre-rossato',
    name: 'Pierre R.',
    role: 'Lead Développeur (Manager MOE)',
    team: 'Management',
    pole: null,
  },

  // Direction
  {
    slug: 'olivier-faivre',
    name: 'Olivier F.',
    role: 'Directeur des Programmes',
    team: 'Direction',
    pole: null,
  },
  {
    slug: 'guillaume-benoit',
    name: 'Guillaume B.',
    role: 'Directeur',
    team: 'Direction',
    pole: null,
  },
]

export const teamMembersBySlug = new Map(teamMembers.map((m) => [m.slug, m]))

export function slugToEmail(slug: string): string {
  const i = slug.lastIndexOf('-')
  return slug.slice(0, i) + '.' + slug.slice(i + 1) + '@sinapse.nc'
}

let fullRoster: Map<string, TeamMember> | null = null

export function upgradeRoster(members: TeamMember[]) {
  fullRoster = new Map(members.map(m => [m.slug, m]))
}

export function findMember(slug: string): TeamMember | undefined {
  return fullRoster?.get(slug) ?? teamMembersBySlug.get(slug)
}

export const teamOrder = [
  'Ingénierie Technique',
  'Développement',
  'Analyse Fonctionnelle',
  'QA & Automatisation',
  'Management',
  'Direction',
]
