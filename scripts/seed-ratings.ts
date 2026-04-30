/**
 * Seed script: populates ratings for ALL team members via the API.
 * Run with: npx tsx scripts/seed-ratings.ts
 */
const API_BASE = 'http://localhost:5175/api/ratings';
// ─── Team members ────────────────────────────────────────
const members = [
    { slug: 'yolan-maldonado', role: 'architect', team: 'engineering' },
    { slug: 'alexandre-thomas', role: 'architect', team: 'engineering' },
    { slug: 'alan-huitel', role: 'devops', team: 'engineering' },
    { slug: 'pierre-mathieu-barras', role: 'devops-dev', team: 'engineering' },
    { slug: 'andy-malo', role: 'data', team: 'engineering' },
    { slug: 'steven-nguyen', role: 'fullstack', team: 'dev' },
    { slug: 'matthieu-alcime', role: 'fullstack', team: 'dev' },
    { slug: 'martin-vallet', role: 'fullstack', team: 'dev' },
    { slug: 'nicole-nguon', role: 'fullstack', team: 'dev' },
    { slug: 'bethlehem-mengistu', role: 'qa', team: 'qa' },
    { slug: 'pierre-rossato', role: 'lead', team: 'management' },
    // Business Analysts (fonctionnel pole)
    { slug: 'nicolas-dufillot', role: 'ba', team: 'fonctionnel' },
    { slug: 'nicolas-eppe', role: 'ba', team: 'fonctionnel' },
    { slug: 'leila-benakezouh', role: 'ba', team: 'fonctionnel' },
    { slug: 'sonalie-taconet', role: 'ba', team: 'fonctionnel' },
    { slug: 'amine-bouali', role: 'ba', team: 'fonctionnel' },
    { slug: 'audrey-queau', role: 'ba', team: 'fonctionnel' },
    // Direction (no pole)
    { slug: 'olivier-faivre', role: 'direction', team: 'direction' },
    { slug: 'guillaume-benoit', role: 'direction', team: 'direction' },
];
// ─── Categories and their skills (full catalog) ─────────
const categories: Record<string, string[]> = {
    'core-engineering': [
        'java', 'typescript', 'python', 'sql', 'bash-shell', 'git-branching', 'patterns-solid', 'testing-strategy',
    ],
    'backend-integration': [
        'spring-boot', 'jpa-hibernate', 'ddd', 'api-design', 'messaging',
        'bpm-orchestration', 'postgresql', 'redis', 'integration-contract-testing',
    ],
    'frontend-ui': [
        'angular', 'rxjs', 'html-css-scss', 'state-management',
        'component-libraries', 'accessibility-design-system', 'frontend-testing',
    ],
    'platform-engineering': [
        'gitlab-ci', 'docker-podman', 'kubernetes', 'helm-kustomize', 'gitops',
        'terraform-opentofu', 'ansible', 'artifact-registries', 'object-storage',
    ],
    'observability-reliability': [
        'prometheus', 'grafana', 'loki-elasticsearch', 'tempo-opentelemetry',
        'error-tracking', 'slo-sla-alerting', 'capacity-resilience',
    ],
    'security-compliance': [
        'iam-authn', 'secret-management', 'supply-chain', 'code-security',
        'encryption-tls', 'network-security-zerotrust', 'threat-modeling',
    ],
    'architecture-governance': [
        'c4-structurizr', 'adrs', 'archimate', 'technical-documentation',
        'modular-microservices', 'api-governance', 'data-modeling', 'urbanisation-si',
    ],
    'soft-skills-delivery': [
        'vulgarisation-pedagogie', 'mentoring', 'cross-team-communication',
        'problem-solving-debugging', 'incident-response', 'stakeholder-communication',
        'agile-scrum', 'code-review',
    ],
    'domain-knowledge': [
        'reglementation-sociale', 'processus-recouvrement', 'travailleurs-independants',
        'sante-ruamm', 'portail-pro', 'gue-rue', 'comptabilite-paiements', 'si-legacy',
    ],
    'ai-engineering': [
        'prompt-engineering', 'ai-assistants', 'coding-assistants', 'rag-knowledge-bases',
        'llm-local-inference', 'llm-api-integration', 'ai-project-management', 'ai-ethics-governance',
    ],
    'qa-test-engineering': [
        'test-strategy', 'test-automation-frameworks', 'e2e-functional-testing',
        'performance-load-testing', 'test-data-management', 'test-environments', 'defect-management',
    ],
    // Fonctionnel pole categories
    'analyse-fonctionnelle': [
        'cross-domain-coordination', 'data-dictionary-referentials', 'gap-analysis-legacy',
        'regulatory-interpretation', 'process-modeling', 'functional-testing',
        'functional-specifications', 'requirements-elicitation',
    ],
    'project-management-pmo': [
        'dependency-coordination', 'stakeholder-engagement', 'risk-management',
        'procurement-contracts', 'scope-change-control', 'planning-scheduling',
        'governance-reporting', 'budget-financial-tracking',
    ],
    'change-management-training': [
        'external-user-accompaniment', 'training-delivery', 'change-communication',
        'training-design', 'impact-analysis', 'adoption-measurement', 'stakeholder-network',
    ],
    'design-ux': [
        'accessibility-rgaa', 'information-architecture', 'ux-design',
        'ui-design-prototyping', 'service-design', 'user-research',
        'ux-writing', 'usability-testing',
    ],
    'data-engineering-governance': [
        'bi-reporting', 'etl-pipelines', 'data-governance-compliance',
        'mdm-referentials', 'data-migration-legacy', 'data-modeling-conceptual', 'data-quality',
    ],
    'management-leadership': [
        'coaching-development', 'management-communication', 'team-management',
        'change-management-legacy', 'multi-stakeholder-piloting', 'strategic-planning',
        'recruiting-onboarding', 'knowledge-transfer-run',
    ],
    // Legacy pole categories
    'legacy-ibmi-adelia': [
        'adelia-rpg-4gl', 'cl-control-language', 'db2-400',
        'legacy-diagnostic-mco', 'batch-scheduling-operations', 'legacy-batch-interfaces',
        'legacy-modernisation', 'ibmi-as400-platform', 'web-adelia',
    ],
    'javaee-jboss': [
        'jboss-wildfly', 'ejb-javaee', 'jms-messaging-legacy', 'jndi-datasources',
        'servlets-jsp', 'migration-legacy-moderne', 'api-wrapping-legacy',
    ],
    // Infrastructure (shared/transverse)
    'infrastructure-systems-network': [
        'linux-administration', 'messaging-collaboration-m365', 'network-switching-routing',
        'backup-disaster-recovery', 'storage-san-nas', 'monitoring-supervision',
        'security-perimeter', 'vmware-virtualization', 'windows-ad', 'cdc-realtime-sync',
    ],
};
const allSkills = Object.values(categories).flat();
const categoryIds = Object.keys(categories);
// ─── Role-based skill profiles (base tendencies) ────────
// Each profile defines a "strength multiplier" per category (0.0-1.0)
// Higher = more likely to have high ratings in that category
type Profile = Record<string, number>;
const profiles: Record<string, Profile> = {
    architect: {
        'core-engineering': 0.85,
        'backend-integration': 0.80,
        'frontend-ui': 0.45,
        'platform-engineering': 0.60,
        'observability-reliability': 0.65,
        'security-compliance': 0.70,
        'architecture-governance': 0.90,
        'soft-skills-delivery': 0.80,
        'domain-knowledge': 0.55,
        'ai-engineering': 0.65,
        'qa-test-engineering': 0.40,
        // Transverse — some fonctionnel exposure
        'project-management-pmo': 0.35,
        'data-engineering-governance': 0.30,
        'management-leadership': 0.40,
    },
    devops: {
        'core-engineering': 0.55,
        'backend-integration': 0.30,
        'frontend-ui': 0.15,
        'platform-engineering': 0.95,
        'observability-reliability': 0.85,
        'security-compliance': 0.70,
        'architecture-governance': 0.45,
        'soft-skills-delivery': 0.55,
        'domain-knowledge': 0.20,
        'ai-engineering': 0.30,
        'qa-test-engineering': 0.35,
        // Transverse
        'infrastructure-systems-network': 0.60,
    },
    'devops-dev': {
        'core-engineering': 0.65,
        'backend-integration': 0.50,
        'frontend-ui': 0.25,
        'platform-engineering': 0.80,
        'observability-reliability': 0.70,
        'security-compliance': 0.60,
        'architecture-governance': 0.45,
        'soft-skills-delivery': 0.50,
        'domain-knowledge': 0.25,
        'ai-engineering': 0.35,
        'qa-test-engineering': 0.40,
        // Transverse
        'infrastructure-systems-network': 0.45,
    },
    data: {
        'core-engineering': 0.60,
        'backend-integration': 0.40,
        'frontend-ui': 0.15,
        'platform-engineering': 0.50,
        'observability-reliability': 0.45,
        'security-compliance': 0.35,
        'architecture-governance': 0.40,
        'soft-skills-delivery': 0.50,
        'domain-knowledge': 0.30,
        'ai-engineering': 0.55,
        'qa-test-engineering': 0.30,
        // Transverse
        'data-engineering-governance': 0.65,
    },
    fullstack: {
        'core-engineering': 0.70,
        'backend-integration': 0.70,
        'frontend-ui': 0.75,
        'platform-engineering': 0.35,
        'observability-reliability': 0.40,
        'security-compliance': 0.40,
        'architecture-governance': 0.50,
        'soft-skills-delivery': 0.55,
        'domain-knowledge': 0.50,
        'ai-engineering': 0.35,
        'qa-test-engineering': 0.45,
        // Transverse
        'design-ux': 0.25,
    },
    qa: {
        'core-engineering': 0.45,
        'backend-integration': 0.30,
        'frontend-ui': 0.35,
        'platform-engineering': 0.40,
        'observability-reliability': 0.50,
        'security-compliance': 0.55,
        'architecture-governance': 0.40,
        'soft-skills-delivery': 0.60,
        'domain-knowledge': 0.45,
        'ai-engineering': 0.25,
        'qa-test-engineering': 0.85,
        // Transverse
        'analyse-fonctionnelle': 0.30,
        'change-management-training': 0.25,
    },
    lead: {
        'core-engineering': 0.75,
        'backend-integration': 0.70,
        'frontend-ui': 0.55,
        'platform-engineering': 0.50,
        'observability-reliability': 0.55,
        'security-compliance': 0.60,
        'architecture-governance': 0.80,
        'soft-skills-delivery': 0.90,
        'domain-knowledge': 0.65,
        'ai-engineering': 0.40,
        'qa-test-engineering': 0.50,
        // Transverse — management-heavy
        'management-leadership': 0.75,
        'project-management-pmo': 0.50,
        'change-management-training': 0.35,
    },
    // Fonctionnel pole
    ba: {
        'analyse-fonctionnelle': 0.85,
        'project-management-pmo': 0.65,
        'change-management-training': 0.60,
        'design-ux': 0.45,
        'data-engineering-governance': 0.55,
        'management-leadership': 0.40,
        'architecture-governance': 0.50,
        'soft-skills-delivery': 0.80,
        'domain-knowledge': 0.75,
        // Cross-pole transverse (lower, but present for comparison)
        'core-engineering': 0.20,
        'backend-integration': 0.15,
        'frontend-ui': 0.10,
        'qa-test-engineering': 0.30,
        'ai-engineering': 0.20,
    },
    // Legacy pole
    'legacy-dev': {
        'legacy-ibmi-adelia': 0.90,
        'javaee-jboss': 0.65,
        'core-engineering': 0.55,
        'architecture-governance': 0.40,
        'soft-skills-delivery': 0.50,
        'domain-knowledge': 0.80,
        // Cross-pole (lower)
        'backend-integration': 0.30,
        'frontend-ui': 0.10,
        'platform-engineering': 0.20,
    },
    // Direction
    direction: {
        'management-leadership': 0.90,
        'architecture-governance': 0.55,
        'soft-skills-delivery': 0.95,
        'domain-knowledge': 0.70,
        'project-management-pmo': 0.60,
        // Technical (low)
        'core-engineering': 0.15,
        'backend-integration': 0.10,
    },
};
// ─── Individual quirks to make data more interesting ─────
// slug -> skill overrides (absolute values)
const individualOverrides: Record<string, Record<string, number>> = {
    'yolan-maldonado': {
        'typescript': 5, 'java': 5, 'ddd': 5, 'api-design': 5,
        'c4-structurizr': 5, 'adrs': 5, 'code-review': 5,
        'patterns-solid': 5, 'modular-microservices': 5,
        'angular': 2, 'rxjs': 2,
    },
    'alexandre-thomas': {
        'java': 5, 'spring-boot': 5, 'jpa-hibernate': 5,
        'postgresql': 5, 'api-design': 5, 'ddd': 4,
        'docker-podman': 4, 'code-review': 5,
        'angular': 3, 'typescript': 4,
    },
    'alan-huitel': {
        'kubernetes': 5, 'docker-podman': 5, 'terraform-opentofu': 5,
        'ansible': 5, 'gitlab-ci': 5, 'prometheus': 5, 'grafana': 5,
        'helm-kustomize': 5, 'bash-shell': 5,
        'java': 1, 'angular': 0, 'rxjs': 0,
    },
    'pierre-mathieu-barras': {
        'docker-podman': 5, 'gitlab-ci': 5, 'kubernetes': 4,
        'java': 3, 'spring-boot': 3, 'typescript': 3,
        'bash-shell': 4, 'ansible': 4,
    },
    'andy-malo': {
        'python': 5, 'sql': 5, 'postgresql': 4,
        'java': 2, 'typescript': 2, 'angular': 0,
        'bash-shell': 4, 'data-modeling': 4,
    },
    'steven-nguyen': {
        'angular': 5, 'rxjs': 4, 'typescript': 4, 'html-css-scss': 4,
        'java': 4, 'spring-boot': 4, 'state-management': 4,
        'kubernetes': 1, 'terraform-opentofu': 0,
    },
    'matthieu-alcime': {
        'java': 4, 'spring-boot': 4, 'angular': 4, 'typescript': 4,
        'jpa-hibernate': 4, 'postgresql': 3,
        'kubernetes': 1, 'docker-podman': 2,
    },
    'martin-vallet': {
        'angular': 4, 'rxjs': 4, 'typescript': 4, 'html-css-scss': 5,
        'component-libraries': 4, 'accessibility-design-system': 4,
        'java': 3, 'spring-boot': 3,
        'kubernetes': 0, 'terraform-opentofu': 0,
    },
    'nicole-nguon': {
        'angular': 4, 'typescript': 4, 'java': 4, 'spring-boot': 3,
        'html-css-scss': 4, 'state-management': 3,
        'rxjs': 3, 'agile-scrum': 4,
        'kubernetes': 1,
    },
    'bethlehem-mengistu': {
        'code-security': 4, 'error-tracking': 4,
        'agile-scrum': 4, 'vulgarisation-pedagogie': 4,
        'java': 2, 'angular': 2, 'typescript': 2,
        'kubernetes': 0, 'terraform-opentofu': 0, 'ansible': 0,
        'test-strategy': 5, 'test-automation-frameworks': 4,
        'e2e-functional-testing': 5, 'defect-management': 4,
    },
    'pierre-rossato': {
        'java': 5, 'spring-boot': 5, 'angular': 4, 'typescript': 4,
        'code-review': 5, 'mentoring': 5, 'stakeholder-communication': 5,
        'agile-scrum': 5, 'cross-team-communication': 5,
        'technical-documentation': 4, 'ddd': 4,
        'kubernetes': 2, 'terraform-opentofu': 1,
    },
    // Real BAs — each with a unique specialization
    'nicolas-dufillot': {
        'functional-specifications': 5, 'requirements-elicitation': 5,
        'regulatory-interpretation': 5, 'process-modeling': 4,
        'reglementation-sociale': 5, 'processus-recouvrement': 5,
        'travailleurs-independants': 4, 'sante-ruamm': 3,
        'stakeholder-communication': 4, 'agile-scrum': 3,
        'data-modeling': 3, 'urbanisation-si': 2,
    },
    'nicolas-eppe': {
        'functional-specifications': 4, 'requirements-elicitation': 4,
        'gap-analysis-legacy': 5, 'cross-domain-coordination': 5,
        'data-dictionary-referentials': 4,
        'si-legacy': 4, 'reglementation-sociale': 3, 'processus-recouvrement': 4,
        'planning-scheduling': 4, 'risk-management': 3,
        'sql': 2, 'data-modeling-conceptual': 3,
    },
    'leila-benakezouh': {
        'functional-specifications': 5, 'process-modeling': 5,
        'functional-testing': 5, 'requirements-elicitation': 4,
        'change-communication': 4, 'training-delivery': 4,
        'sante-ruamm': 5, 'portail-pro': 4,
        'ux-design': 3, 'usability-testing': 3,
        'test-strategy': 2, 'e2e-functional-testing': 2,
    },
    'sonalie-taconet': {
        'requirements-elicitation': 5, 'regulatory-interpretation': 4,
        'stakeholder-engagement': 5, 'change-communication': 5,
        'training-design': 4, 'training-delivery': 4, 'impact-analysis': 4,
        'comptabilite-paiements': 4, 'gue-rue': 5,
        'stakeholder-communication': 5, 'mentoring': 3,
    },
    'amine-bouali': {
        'functional-specifications': 4, 'data-dictionary-referentials': 5,
        'data-modeling-conceptual': 4, 'data-governance-compliance': 4,
        'bi-reporting': 3, 'etl-pipelines': 3,
        'reglementation-sociale': 4, 'travailleurs-independants': 5,
        'sql': 3, 'python': 2,
        'governance-reporting': 4, 'budget-financial-tracking': 3,
    },
    'audrey-queau': {
        'requirements-elicitation': 4, 'process-modeling': 4,
        'information-architecture': 4, 'ux-design': 4,
        'ui-design-prototyping': 3, 'user-research': 4,
        'accessibility-rgaa': 3, 'service-design': 3,
        'portail-pro': 5, 'sante-ruamm': 3,
        'change-communication': 3, 'external-user-accompaniment': 4,
    },
    // Direction — broad management + strategic
    'olivier-faivre': {
        'strategic-planning': 5, 'multi-stakeholder-piloting': 5,
        'team-management': 4, 'coaching-development': 4,
        'management-communication': 5, 'recruiting-onboarding': 4,
        'stakeholder-communication': 5, 'cross-team-communication': 5,
        'agile-scrum': 3, 'mentoring': 4,
        'reglementation-sociale': 4, 'processus-recouvrement': 3,
        'urbanisation-si': 3, 'archimate': 2,
        'governance-reporting': 4, 'budget-financial-tracking': 4,
    },
    'guillaume-benoit': {
        'strategic-planning': 4, 'multi-stakeholder-piloting': 4,
        'team-management': 5, 'coaching-development': 5,
        'management-communication': 4, 'knowledge-transfer-run': 5,
        'change-management-legacy': 4, 'recruiting-onboarding': 3,
        'stakeholder-communication': 4, 'cross-team-communication': 4,
        'mentoring': 5, 'agile-scrum': 3,
        'reglementation-sociale': 3, 'si-legacy': 3,
        'risk-management': 3, 'scope-change-control': 3,
    },
};
// ─── Seeded random for reproducibility ───────────────────
let seed = 42;
function seededRandom(): number {
    seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
    return seed / 0x7fffffff;
}
// Hash a string into a deterministic number (for per-skill variation)
function hashString(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
}
function generateRating(profileStrength: number, memberSlug: string, skillId: string): number {
    const r = seededRandom();
    // Per-skill deterministic offset based on member+skill combo (-0.3 to +0.3)
    const skillHash = hashString(`${memberSlug}:${skillId}`);
    const skillOffset = ((skillHash % 61) - 30) / 100; // -0.30 to +0.30
    // Wider noise range (±2 levels instead of ±1.5) for more spread
    const adjusted = profileStrength + skillOffset;
    const base = adjusted * 5;
    const noisy = base + (r - 0.5) * 4;
    // Allow 0 for things people truly don't know
    return Math.max(0, Math.min(5, Math.round(noisy)));
}
function generateExperience(profileStrength: number): number {
    const r = seededRandom();
    const base = profileStrength * 4;
    const noisy = base + (r - 0.5) * 3;
    return Math.max(0, Math.min(4, Math.round(noisy)));
}
// ─── Main ────────────────────────────────────────────────
async function main() {
    console.log(`Seeding ratings for ${members.length} members...`);
    console.log(`Total skills per member: ${allSkills.length}`);
    console.log(`Categories: ${categoryIds.length}`);
    console.log();
    for (const member of members) {
        const profile = profiles[member.role];
        if (!profile) {
            console.error(`  SKIPPED ${member.slug}: no profile for role '${member.role}'`);
            continue;
        }
        const overrides = individualOverrides[member.slug] ?? {};
        // Generate ratings — per-skill variation within each category
        // Only rate categories that the profile has a strength for (skip irrelevant categories)
        const ratings: Record<string, number> = {};
        for (const [catId, skills] of Object.entries(categories)) {
            const strength = profile[catId];
            if (strength === undefined)
                continue; // Skip categories not in this role's profile
            for (const skillId of skills) {
                if (overrides[skillId] !== undefined) {
                    ratings[skillId] = overrides[skillId];
                }
                else {
                    ratings[skillId] = generateRating(strength, member.slug, skillId);
                }
            }
        }
        // Generate experience per category (only for categories in profile)
        const experience: Record<string, number> = {};
        for (const catId of categoryIds) {
            const strength = profile[catId];
            if (strength === undefined)
                continue;
            experience[catId] = generateExperience(strength);
        }
        const body = {
            ratings,
            experience,
            skippedCategories: [],
        };
        // PUT ratings
        console.log(`PUT ${member.slug} (${member.role})...`);
        const putRes = await fetch(`${API_BASE}/${member.slug}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!putRes.ok) {
            const err = await putRes.text();
            console.error(`  FAILED PUT: ${putRes.status} ${err}`);
            continue;
        }
        // POST submit
        const submitRes = await fetch(`${API_BASE}/${member.slug}/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        });
        if (!submitRes.ok) {
            const err = await submitRes.text();
            console.error(`  FAILED SUBMIT: ${submitRes.status} ${err}`);
            continue;
        }
        const result = await submitRes.json();
        const ratingCount = Object.keys(result.ratings).length;
        const expCount = Object.keys(result.experience).length;
        console.log(`  OK: ${ratingCount} ratings, ${expCount} experience entries, submitted at ${result.submittedAt}`);
    }
    console.log('\nDone! All members seeded.');
}
main().catch(console.error);
