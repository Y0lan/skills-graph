/**
 * Seed script: populates ratings for ALL team members via the API.
 * Run with: npx tsx scripts/seed-ratings.ts
 */

const API_BASE = 'http://localhost:5175/api/ratings'

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
]

// ─── Categories and their skills ─────────────────────────
const categories: Record<string, string[]> = {
  'core-engineering': [
    'java', 'typescript', 'python', 'sql', 'bash-shell', 'git-branching', 'patterns-solid',
  ],
  'backend-integration': [
    'spring-boot', 'jpa-hibernate', 'ddd', 'api-design', 'messaging',
    'bpm-orchestration', 'postgresql', 'redis-dragonfly',
  ],
  'frontend-ui': [
    'angular', 'rxjs', 'html-css-scss', 'state-management',
    'component-libraries', 'accessibility-design-system',
  ],
  'platform-engineering': [
    'gitlab-ci', 'docker-podman', 'kubernetes', 'helm-kustomize',
    'terraform-opentofu', 'ansible', 'artifact-registries',
  ],
  'observability-reliability': [
    'prometheus', 'grafana', 'loki-elasticsearch', 'tempo-opentelemetry',
    'sentry', 'slo-sla-alerting', 'capacity-resilience',
  ],
  'security-compliance': [
    'iam-keycloak', 'secret-management', 'supply-chain', 'code-security',
    'mfa-yubikey', 'encryption-tls', 'threat-modeling',
  ],
  'architecture-governance': [
    'c4-structurizr', 'adrs', 'archimate', 'technical-documentation',
    'agile-scrum', 'code-review', 'modular-microservices', 'api-governance', 'data-modeling',
  ],
  'soft-skills': [
    'technical-writing', 'mentoring', 'cross-team-communication',
    'problem-solving-debugging', 'incident-response', 'stakeholder-communication',
  ],
  'domain-knowledge': [
    'reglementation-sociale', 'processus-recouvrement', 'travailleurs-independants',
    'sante-ruamm', 'portail-pro', 'gue-rue', 'comptabilite-paiements',
    'si-legacy', 'urbanisation-si',
  ],
}

const allSkills = Object.values(categories).flat()
const categoryIds = Object.keys(categories)

// ─── Role-based skill profiles (base tendencies) ────────
// Each profile defines a "strength multiplier" per category (0.0-1.0)
// Higher = more likely to have high ratings in that category
type Profile = Record<string, number>

const profiles: Record<string, Profile> = {
  architect: {
    'core-engineering': 0.85,
    'backend-integration': 0.80,
    'frontend-ui': 0.45,
    'platform-engineering': 0.60,
    'observability-reliability': 0.65,
    'security-compliance': 0.70,
    'architecture-governance': 0.90,
    'soft-skills': 0.80,
    'domain-knowledge': 0.55,
  },
  devops: {
    'core-engineering': 0.55,
    'backend-integration': 0.30,
    'frontend-ui': 0.15,
    'platform-engineering': 0.95,
    'observability-reliability': 0.85,
    'security-compliance': 0.70,
    'architecture-governance': 0.45,
    'soft-skills': 0.55,
    'domain-knowledge': 0.20,
  },
  'devops-dev': {
    'core-engineering': 0.65,
    'backend-integration': 0.50,
    'frontend-ui': 0.25,
    'platform-engineering': 0.80,
    'observability-reliability': 0.70,
    'security-compliance': 0.60,
    'architecture-governance': 0.45,
    'soft-skills': 0.50,
    'domain-knowledge': 0.25,
  },
  data: {
    'core-engineering': 0.60,
    'backend-integration': 0.40,
    'frontend-ui': 0.15,
    'platform-engineering': 0.50,
    'observability-reliability': 0.45,
    'security-compliance': 0.35,
    'architecture-governance': 0.40,
    'soft-skills': 0.50,
    'domain-knowledge': 0.30,
  },
  fullstack: {
    'core-engineering': 0.70,
    'backend-integration': 0.70,
    'frontend-ui': 0.75,
    'platform-engineering': 0.35,
    'observability-reliability': 0.40,
    'security-compliance': 0.40,
    'architecture-governance': 0.50,
    'soft-skills': 0.55,
    'domain-knowledge': 0.50,
  },
  qa: {
    'core-engineering': 0.45,
    'backend-integration': 0.30,
    'frontend-ui': 0.35,
    'platform-engineering': 0.40,
    'observability-reliability': 0.50,
    'security-compliance': 0.55,
    'architecture-governance': 0.40,
    'soft-skills': 0.60,
    'domain-knowledge': 0.45,
  },
  lead: {
    'core-engineering': 0.75,
    'backend-integration': 0.70,
    'frontend-ui': 0.55,
    'platform-engineering': 0.50,
    'observability-reliability': 0.55,
    'security-compliance': 0.60,
    'architecture-governance': 0.80,
    'soft-skills': 0.90,
    'domain-knowledge': 0.65,
  },
}

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
    'code-security': 4, 'sentry': 4,
    'agile-scrum': 4, 'technical-writing': 4,
    'java': 2, 'angular': 2, 'typescript': 2,
    'kubernetes': 0, 'terraform-opentofu': 0, 'ansible': 0,
  },
  'pierre-rossato': {
    'java': 5, 'spring-boot': 5, 'angular': 4, 'typescript': 4,
    'code-review': 5, 'mentoring': 5, 'stakeholder-communication': 5,
    'agile-scrum': 5, 'cross-team-communication': 5,
    'technical-documentation': 4, 'ddd': 4,
    'kubernetes': 2, 'terraform-opentofu': 1,
  },
}

// ─── Seeded random for reproducibility ───────────────────
let seed = 42
function seededRandom(): number {
  seed = (seed * 1664525 + 1013904223) & 0x7fffffff
  return seed / 0x7fffffff
}

// Hash a string into a deterministic number (for per-skill variation)
function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

function generateRating(profileStrength: number, memberSlug: string, skillId: string): number {
  const r = seededRandom()
  // Per-skill deterministic offset based on member+skill combo (-0.3 to +0.3)
  const skillHash = hashString(`${memberSlug}:${skillId}`)
  const skillOffset = ((skillHash % 61) - 30) / 100 // -0.30 to +0.30

  // Wider noise range (±2 levels instead of ±1.5) for more spread
  const adjusted = profileStrength + skillOffset
  const base = adjusted * 5
  const noisy = base + (r - 0.5) * 4
  // Allow 0 for things people truly don't know
  return Math.max(0, Math.min(5, Math.round(noisy)))
}

function generateExperience(profileStrength: number): number {
  const r = seededRandom()
  const base = profileStrength * 4
  const noisy = base + (r - 0.5) * 3
  return Math.max(0, Math.min(4, Math.round(noisy)))
}

// ─── Main ────────────────────────────────────────────────
async function main() {
  console.log(`Seeding ratings for ${members.length} members...`)
  console.log(`Total skills per member: ${allSkills.length}`)
  console.log(`Categories: ${categoryIds.length}`)
  console.log()

  for (const member of members) {
    const profile = profiles[member.role]
    const overrides = individualOverrides[member.slug] ?? {}

    // Generate ratings — per-skill variation within each category
    const ratings: Record<string, number> = {}
    for (const [catId, skills] of Object.entries(categories)) {
      const strength = profile[catId] ?? 0.5
      for (const skillId of skills) {
        if (overrides[skillId] !== undefined) {
          ratings[skillId] = overrides[skillId]
        } else {
          ratings[skillId] = generateRating(strength, member.slug, skillId)
        }
      }
    }

    // Generate experience per category
    const experience: Record<string, number> = {}
    for (const catId of categoryIds) {
      const strength = profile[catId] ?? 0.5
      experience[catId] = generateExperience(strength)
    }

    const body = {
      ratings,
      experience,
      skippedCategories: [],
    }

    // PUT ratings
    console.log(`PUT ${member.slug} (${member.role})...`)
    const putRes = await fetch(`${API_BASE}/${member.slug}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!putRes.ok) {
      const err = await putRes.text()
      console.error(`  FAILED PUT: ${putRes.status} ${err}`)
      continue
    }

    // POST submit
    const submitRes = await fetch(`${API_BASE}/${member.slug}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })

    if (!submitRes.ok) {
      const err = await submitRes.text()
      console.error(`  FAILED SUBMIT: ${submitRes.status} ${err}`)
      continue
    }

    const result = await submitRes.json()
    const ratingCount = Object.keys(result.ratings).length
    const expCount = Object.keys(result.experience).length
    console.log(`  OK: ${ratingCount} ratings, ${expCount} experience entries, submitted at ${result.submittedAt}`)
  }

  console.log('\nDone! All members seeded.')
}

main().catch(console.error)
