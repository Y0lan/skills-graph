export type Pole = 'legacy' | 'java_modernisation' | 'fonctionnel';
export interface TeamMember {
    slug: string;
    name: string;
    role: string;
    team: string;
    email: string;
    pole: Pole | null;
}
export const teamMembers: TeamMember[] = [
    // Ingénierie Technique
    {
        slug: 'yolan-maldonado',
        name: 'Yolan MALDONADO',
        role: 'Architecte Technique Logiciel',
        team: 'Ingénierie Technique',
        email: 'yolan.maldonado@sinapse.nc',
        pole: 'java_modernisation',
    },
    {
        slug: 'alexandre-thomas',
        name: 'Alexandre THOMAS',
        role: 'Architecte Technique Logiciel',
        team: 'Ingénierie Technique',
        email: 'alexandre.thomas@sinapse.nc',
        pole: 'java_modernisation',
    },
    {
        slug: 'alan-huitel',
        name: 'Alan HUITEL',
        role: 'Ingénieur DevOps',
        team: 'Ingénierie Technique',
        email: 'alan.huitel@sinapse.nc',
        pole: 'java_modernisation',
    },
    {
        slug: 'pierre-mathieu-barras',
        name: 'Pierre-Mathieu BARRAS',
        role: 'Ingénieur DevOps / Développeur',
        team: 'Ingénierie Technique',
        email: 'pierre-mathieu.barras@sinapse.nc',
        pole: 'java_modernisation',
    },
    {
        slug: 'andy-malo',
        name: 'Andy MALO',
        role: 'Ingénieur Data',
        team: 'Ingénierie Technique',
        email: 'andy.malo@sinapse.nc',
        pole: 'java_modernisation',
    },
    // Développement
    {
        slug: 'steven-nguyen',
        name: 'Steven NGUYEN',
        role: 'Développeur Full Stack',
        team: 'Développement',
        email: 'steven.nguyen@sinapse.nc',
        pole: 'java_modernisation',
    },
    {
        slug: 'matthieu-alcime',
        name: 'Matthieu ALCIME',
        role: 'Développeur Full Stack',
        team: 'Développement',
        email: 'matthieu.alcime@sinapse.nc',
        pole: 'java_modernisation',
    },
    {
        slug: 'martin-vallet',
        name: 'Martin VALLET',
        role: 'Développeur Full Stack',
        team: 'Développement',
        email: 'martin.vallet@sinapse.nc',
        pole: 'java_modernisation',
    },
    {
        slug: 'nicole-nguon',
        name: 'Nicole NGUON',
        role: 'Développeuse Full Stack',
        team: 'Développement',
        email: 'nicole.nguon@sinapse.nc',
        pole: 'java_modernisation',
    },
    // QA & Automatisation
    {
        slug: 'bethlehem-mengistu',
        name: 'Bethlehem MENGISTU',
        role: 'Ingénieure QA',
        team: 'QA & Automatisation',
        email: 'bethlehem.mengistu@sinapse.nc',
        pole: 'java_modernisation',
    },
    // Management
    {
        slug: 'pierre-rossato',
        name: 'Pierre ROSSATO',
        role: 'Lead Développeur (Manager MOE)',
        team: 'Management',
        email: 'pierre.rossato@sinapse.nc',
        pole: null,
    },
    // Business Analysts
    {
        slug: 'nicolas-dufillot',
        name: 'Nicolas DUFILLOT',
        role: 'Business Analyst',
        team: 'Analyse Fonctionnelle',
        email: 'nicolas.dufillot@sinapse.nc',
        pole: 'fonctionnel',
    },
    {
        slug: 'nicolas-eppe',
        name: 'Nicolas EPPE',
        role: 'Business Analyst',
        team: 'Analyse Fonctionnelle',
        email: 'nicolas.eppe@sinapse.nc',
        pole: 'fonctionnel',
    },
    {
        slug: 'leila-benakezouh',
        name: 'Leila BENAKEZOUH',
        role: 'Business Analyst',
        team: 'Analyse Fonctionnelle',
        email: 'leila.benakezouh@sinapse.nc',
        pole: 'fonctionnel',
    },
    {
        slug: 'sonalie-taconet',
        name: 'Sonalie TACONET',
        role: 'Business Analyst',
        team: 'Analyse Fonctionnelle',
        email: 'sonalie.taconet@sinapse.nc',
        pole: 'fonctionnel',
    },
    {
        slug: 'amine-bouali',
        name: 'Amine BOUALI',
        role: 'Business Analyst',
        team: 'Analyse Fonctionnelle',
        email: 'amine.bouali@sinapse.nc',
        pole: 'fonctionnel',
    },
    {
        slug: 'audrey-queau',
        name: 'Audrey QUEAU',
        role: 'Business Analyst',
        team: 'Analyse Fonctionnelle',
        email: 'audrey.queau@sinapse.nc',
        pole: 'fonctionnel',
    },
    // Direction
    {
        slug: 'olivier-faivre',
        name: 'Olivier FAIVRE',
        role: 'Directeur des Programmes',
        team: 'Direction',
        email: 'olivier.faivre@sinapse.nc',
        pole: null,
    },
    {
        slug: 'guillaume-benoit',
        name: 'Guillaume BENOIT',
        role: 'Directeur',
        team: 'Direction',
        email: 'guillaume.benoit@sinapse.nc',
        pole: null,
    },
];
export const teamMembersBySlug = new Map(teamMembers.map((m) => [m.slug, m]));
export function findMember(slug: string): TeamMember | undefined {
    return teamMembersBySlug.get(slug);
}
export const teamOrder = [
    'Ingénierie Technique',
    'Développement',
    'QA & Automatisation',
    'Management',
    'Direction',
];
