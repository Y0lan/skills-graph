export interface TeamMember {
  slug: string
  name: string
  role: string
  team: string
  email: string
}

export const teamMembers: TeamMember[] = [
  // Ingénierie Technique
  {
    slug: 'yolan-maldonado',
    name: 'Yolan MALDONADO',
    role: 'Architecte Technique Logiciel',
    team: 'Ingénierie Technique',
    email: 'yolan.maldonado@sinapse.nc',
  },
  {
    slug: 'alexandre-thomas',
    name: 'Alexandre THOMAS',
    role: 'Architecte Technique Logiciel',
    team: 'Ingénierie Technique',
    email: 'alexandre.thomas@sinapse.nc',
  },
  {
    slug: 'alan-huitel',
    name: 'Alan HUITEL',
    role: 'Ingénieur DevOps',
    team: 'Ingénierie Technique',
    email: 'alan.huitel@sinapse.nc',
  },
  {
    slug: 'pierre-mathieu-barras',
    name: 'Pierre-Mathieu BARRAS',
    role: 'Ingénieur DevOps / Développeur',
    team: 'Ingénierie Technique',
    email: 'pierre-mathieu.barras@sinapse.nc',
  },
  {
    slug: 'andy-malo',
    name: 'Andy MALO',
    role: 'Ingénieur Data',
    team: 'Ingénierie Technique',
    email: 'andy.malo@sinapse.nc',
  },

  // Développement
  {
    slug: 'steven-nguyen',
    name: 'Steven NGUYEN',
    role: 'Développeur Full Stack',
    team: 'Développement',
    email: 'steven.nguyen@sinapse.nc',
  },
  {
    slug: 'matthieu-alcime',
    name: 'Matthieu ALCIME',
    role: 'Développeur Full Stack',
    team: 'Développement',
    email: 'matthieu.alcime@sinapse.nc',
  },
  {
    slug: 'martin-vallet',
    name: 'Martin VALLET',
    role: 'Développeur Full Stack',
    team: 'Développement',
    email: 'martin.vallet@sinapse.nc',
  },
  {
    slug: 'nicole-nguon',
    name: 'Nicole NGUON',
    role: 'Développeuse Full Stack',
    team: 'Développement',
    email: 'nicole.nguon@sinapse.nc',
  },

  // QA & Automatisation
  {
    slug: 'bethlehem-mengistu',
    name: 'Bethlehem MENGISTU',
    role: 'Ingénieure QA',
    team: 'QA & Automatisation',
    email: 'bethlehem.mengistu@sinapse.nc',
  },

  // Management
  {
    slug: 'pierre-rossato',
    name: 'Pierre ROSSATO',
    role: 'Lead Développeur (Manager MOE)',
    team: 'Management',
    email: 'pierre.rossato@sinapse.nc',
  },

  // Direction
  {
    slug: 'olivier-faivre',
    name: 'Olivier FAIVRE',
    role: 'Directeur des Programmes',
    team: 'Direction',
    email: 'olivier.faivre@sinapse.nc',
  },
  {
    slug: 'guillaume-benoit',
    name: 'Guillaume BENOIT',
    role: 'Directeur',
    team: 'Direction',
    email: 'guillaume.benoit@sinapse.nc',
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
  'Direction',
]
