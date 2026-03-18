export interface TeamMember {
  slug: string
  name: string
  role: string
  team: string
}

export const teamMembers: TeamMember[] = [
  // Ingénierie Technique
  {
    slug: 'yolan-maldonado',
    name: 'Yolan M.',
    role: 'Architecte Technique Logiciel',
    team: 'Ingénierie Technique',
  },
  {
    slug: 'alexandre-thomas',
    name: 'Alexandre T.',
    role: 'Architecte Technique Logiciel',
    team: 'Ingénierie Technique',
  },
  {
    slug: 'alan-huitel',
    name: 'Alan H.',
    role: 'Ingénieur DevOps',
    team: 'Ingénierie Technique',
  },
  {
    slug: 'pierre-mathieu-barras',
    name: 'Pierre-Mathieu B.',
    role: 'Ingénieur DevOps / Développeur',
    team: 'Ingénierie Technique',
  },
  {
    slug: 'andy-malo',
    name: 'Andy M.',
    role: 'Ingénieur Data',
    team: 'Ingénierie Technique',
  },

  // Développement
  {
    slug: 'steven-nguyen',
    name: 'Steven N.',
    role: 'Développeur Full Stack',
    team: 'Développement',
  },
  {
    slug: 'matthieu-alcime',
    name: 'Matthieu A.',
    role: 'Développeur Full Stack',
    team: 'Développement',
  },
  {
    slug: 'martin-vallet',
    name: 'Martin V.',
    role: 'Développeur Full Stack',
    team: 'Développement',
  },
  {
    slug: 'nicole-nguon',
    name: 'Nicole N.',
    role: 'Développeuse Full Stack',
    team: 'Développement',
  },

  // QA & Automatisation
  {
    slug: 'bethlehem-mengistu',
    name: 'Bethlehem M.',
    role: 'Ingénieure QA',
    team: 'QA & Automatisation',
  },

  // Management
  {
    slug: 'pierre-rossato',
    name: 'Pierre R.',
    role: 'Lead Développeur (Manager MOE)',
    team: 'Management',
  },

  // Direction
  {
    slug: 'olivier-faivre',
    name: 'Olivier F.',
    role: 'Directeur des Programmes',
    team: 'Direction',
  },
  {
    slug: 'guillaume-benoit',
    name: 'Guillaume B.',
    role: 'Directeur',
    team: 'Direction',
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
  'QA & Automatisation',
  'Management',
  'Direction',
]
