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
    name: 'Yolan MALDONADO',
    role: 'Architecte Technique Logiciel',
    team: 'Ingénierie Technique',
  },
  {
    slug: 'alexandre-thomas',
    name: 'Alexandre THOMAS',
    role: 'Architecte Technique Logiciel',
    team: 'Ingénierie Technique',
  },
  {
    slug: 'alan-huitel',
    name: 'Alan HUITEL',
    role: 'Ingénieur DevOps',
    team: 'Ingénierie Technique',
  },
  {
    slug: 'pierre-mathieu-barras',
    name: 'Pierre-Mathieu BARRAS',
    role: 'Ingénieur DevOps / Développeur',
    team: 'Ingénierie Technique',
  },
  {
    slug: 'andy-malo',
    name: 'Andy MALO',
    role: 'Ingénieur Data',
    team: 'Ingénierie Technique',
  },

  // Développement
  {
    slug: 'steven-nguyen',
    name: 'Steven NGUYEN',
    role: 'Développeur Full Stack',
    team: 'Développement',
  },
  {
    slug: 'matthieu-alcime',
    name: 'Matthieu ALCIME',
    role: 'Développeur Full Stack',
    team: 'Développement',
  },
  {
    slug: 'martin-vallet',
    name: 'Martin VALLET',
    role: 'Développeur Full Stack',
    team: 'Développement',
  },
  {
    slug: 'nicole-nguon',
    name: 'Nicole NGUON',
    role: 'Développeuse Full Stack',
    team: 'Développement',
  },

  // QA & Automatisation
  {
    slug: 'bethlehem-mengistu',
    name: 'Bethlehem MENGISTU',
    role: 'Ingénieure QA',
    team: 'QA & Automatisation',
  },

  // Management
  {
    slug: 'pierre-rossato',
    name: 'Pierre ROSSATO',
    role: 'Lead Développeur (Manager MOE)',
    team: 'Management',
  },
]

export const teamMembersBySlug = new Map(teamMembers.map((m) => [m.slug, m]))

export function findMember(slug: string): TeamMember | undefined {
  return teamMembersBySlug.get(slug)
}

export const teamOrder = [
  'Ingénierie Technique',
  'Développement',
  'QA & Automatisation',
  'Management',
]
