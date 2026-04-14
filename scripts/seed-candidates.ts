/**
 * Seed script: creates candidates with filled skill profiles for testing.
 * Creates candidates, fills their ratings, submits them, and links them to postes.
 *
 * Run with: npx tsx scripts/seed-candidates.ts
 * Requires: server running on localhost:5175
 */

const API_BASE = 'http://localhost:5175'

// ─── Candidate definitions ──────────────────────────────
interface CandidateSpec {
  name: string
  email: string
  posteId: string
  ratings: Record<string, number>
}

const candidates: CandidateSpec[] = [
  // ── Java / Modernisation pole ──────────────────────────
  {
    name: 'Thomas DUPONT',
    email: 'thomas.dupont@example.com',
    posteId: 'poste-4-dev-java-fullstack',
    ratings: {
      // Core engineering — strong Java, decent TS
      'java': 5, 'typescript': 3, 'python': 2, 'sql': 4,
      'bash-shell': 3, 'git-branching': 4, 'patterns-solid': 4, 'testing-strategy': 3,
      // Backend — Spring expert
      'spring-boot': 5, 'jpa-hibernate': 4, 'ddd': 3, 'api-design': 4,
      'messaging': 3, 'bpm-orchestration': 1, 'postgresql': 4, 'redis': 2,
      'integration-contract-testing': 2,
      // Frontend — functional but not strong
      'angular': 3, 'rxjs': 2, 'html-css-scss': 3, 'state-management': 2,
      'component-libraries': 2, 'accessibility-design-system': 1, 'frontend-testing': 2,
      // Platform — basic Docker/CI
      'gitlab-ci': 3, 'docker-podman': 3, 'kubernetes': 1, 'helm-kustomize': 1,
      'gitops': 1, 'terraform-opentofu': 0, 'ansible': 0, 'artifact-registries': 1,
      'object-storage': 1,
      // Architecture transverse
      'c4-structurizr': 2, 'adrs': 1, 'archimate': 0, 'technical-documentation': 3,
      'modular-microservices': 3, 'api-governance': 2, 'data-modeling': 3, 'urbanisation-si': 1,
      // Soft skills
      'vulgarisation-pedagogie': 2, 'mentoring': 2, 'cross-team-communication': 3,
      'problem-solving-debugging': 4, 'incident-response': 2, 'stakeholder-communication': 2,
      'agile-scrum': 3, 'code-review': 4,
      // Domain
      'reglementation-sociale': 1, 'processus-recouvrement': 0, 'travailleurs-independants': 0,
      'sante-ruamm': 0, 'portail-pro': 0, 'gue-rue': 0, 'comptabilite-paiements': 0, 'si-legacy': 1,
    },
  },
  {
    name: 'Marie LECLERC',
    email: 'marie.leclerc@example.com',
    posteId: 'poste-4-dev-java-fullstack',
    ratings: {
      // Core — balanced fullstack
      'java': 4, 'typescript': 4, 'python': 1, 'sql': 3,
      'bash-shell': 2, 'git-branching': 4, 'patterns-solid': 3, 'testing-strategy': 4,
      // Backend — solid but not expert
      'spring-boot': 4, 'jpa-hibernate': 3, 'ddd': 2, 'api-design': 3,
      'messaging': 2, 'bpm-orchestration': 0, 'postgresql': 3, 'redis': 2,
      'integration-contract-testing': 3,
      // Frontend — strong Angular
      'angular': 5, 'rxjs': 4, 'html-css-scss': 4, 'state-management': 4,
      'component-libraries': 3, 'accessibility-design-system': 3, 'frontend-testing': 4,
      // Platform — minimal
      'gitlab-ci': 2, 'docker-podman': 2, 'kubernetes': 0, 'helm-kustomize': 0,
      'gitops': 0, 'terraform-opentofu': 0, 'ansible': 0, 'artifact-registries': 1,
      'object-storage': 0,
      // Architecture
      'c4-structurizr': 1, 'adrs': 1, 'archimate': 0, 'technical-documentation': 2,
      'modular-microservices': 2, 'api-governance': 2, 'data-modeling': 2, 'urbanisation-si': 0,
      // Soft skills
      'vulgarisation-pedagogie': 3, 'mentoring': 2, 'cross-team-communication': 3,
      'problem-solving-debugging': 3, 'incident-response': 1, 'stakeholder-communication': 3,
      'agile-scrum': 4, 'code-review': 3,
      // Domain
      'reglementation-sociale': 0, 'processus-recouvrement': 0, 'travailleurs-independants': 0,
      'sante-ruamm': 0, 'portail-pro': 1, 'gue-rue': 0, 'comptabilite-paiements': 0, 'si-legacy': 0,
    },
  },
  {
    name: 'Julien MOREAU',
    email: 'julien.moreau@example.com',
    posteId: 'poste-3-tech-lead-java',
    ratings: {
      // Core — very strong
      'java': 5, 'typescript': 4, 'python': 3, 'sql': 5,
      'bash-shell': 4, 'git-branching': 5, 'patterns-solid': 5, 'testing-strategy': 4,
      // Backend — expert
      'spring-boot': 5, 'jpa-hibernate': 5, 'ddd': 5, 'api-design': 5,
      'messaging': 4, 'bpm-orchestration': 2, 'postgresql': 5, 'redis': 3,
      'integration-contract-testing': 3,
      // Frontend — can do it
      'angular': 3, 'rxjs': 2, 'html-css-scss': 3, 'state-management': 2,
      'component-libraries': 2, 'accessibility-design-system': 1, 'frontend-testing': 2,
      // Platform — solid awareness
      'gitlab-ci': 4, 'docker-podman': 4, 'kubernetes': 3, 'helm-kustomize': 2,
      'gitops': 2, 'terraform-opentofu': 1, 'ansible': 1, 'artifact-registries': 2,
      'object-storage': 1,
      // Architecture — lead level
      'c4-structurizr': 4, 'adrs': 4, 'archimate': 2, 'technical-documentation': 4,
      'modular-microservices': 5, 'api-governance': 4, 'data-modeling': 4, 'urbanisation-si': 3,
      // Soft skills — lead profile
      'vulgarisation-pedagogie': 4, 'mentoring': 5, 'cross-team-communication': 4,
      'problem-solving-debugging': 5, 'incident-response': 3, 'stakeholder-communication': 4,
      'agile-scrum': 4, 'code-review': 5,
      // Domain — some knowledge
      'reglementation-sociale': 2, 'processus-recouvrement': 1, 'travailleurs-independants': 1,
      'sante-ruamm': 1, 'portail-pro': 1, 'gue-rue': 0, 'comptabilite-paiements': 0, 'si-legacy': 2,
    },
  },
  {
    name: 'Sophie MARTIN',
    email: 'sophie.martin@example.com',
    posteId: 'poste-6-architecte-si',
    ratings: {
      // Core
      'java': 5, 'typescript': 4, 'python': 3, 'sql': 4,
      'bash-shell': 3, 'git-branching': 4, 'patterns-solid': 5, 'testing-strategy': 3,
      // Backend
      'spring-boot': 4, 'jpa-hibernate': 3, 'ddd': 5, 'api-design': 5,
      'messaging': 4, 'bpm-orchestration': 3, 'postgresql': 4, 'redis': 3,
      'integration-contract-testing': 3,
      // Frontend — strategic
      'angular': 2, 'rxjs': 1, 'html-css-scss': 2, 'state-management': 2,
      'component-libraries': 2, 'accessibility-design-system': 2, 'frontend-testing': 1,
      // Platform — architectural oversight
      'gitlab-ci': 3, 'docker-podman': 3, 'kubernetes': 3, 'helm-kustomize': 2,
      'gitops': 3, 'terraform-opentofu': 2, 'ansible': 1, 'artifact-registries': 2,
      'object-storage': 2,
      // Architecture — core strength
      'c4-structurizr': 5, 'adrs': 5, 'archimate': 4, 'technical-documentation': 5,
      'modular-microservices': 5, 'api-governance': 5, 'data-modeling': 5, 'urbanisation-si': 4,
      // Soft skills
      'vulgarisation-pedagogie': 5, 'mentoring': 4, 'cross-team-communication': 5,
      'problem-solving-debugging': 4, 'incident-response': 3, 'stakeholder-communication': 5,
      'agile-scrum': 4, 'code-review': 5,
      // Domain
      'reglementation-sociale': 3, 'processus-recouvrement': 2, 'travailleurs-independants': 1,
      'sante-ruamm': 1, 'portail-pro': 2, 'gue-rue': 0, 'comptabilite-paiements': 1, 'si-legacy': 3,
    },
  },

  // ── Legacy / Adélia pole ───────────────────────────────
  {
    name: 'Philippe GARCIA',
    email: 'philippe.garcia@example.com',
    posteId: 'poste-2-dev-senior-adelia',
    ratings: {
      // Legacy — expert
      'adelia-rpg-4gl': 5, 'cl-control-language': 5, 'db2-400': 5,
      'legacy-diagnostic-mco': 4, 'batch-scheduling-operations': 5,
      'legacy-batch-interfaces': 4, 'legacy-modernisation': 3,
      'ibmi-as400-platform': 5, 'web-adelia': 4,
      // Core — SQL strong, modern weak
      'java': 1, 'typescript': 0, 'python': 1, 'sql': 5,
      'bash-shell': 3, 'git-branching': 2, 'patterns-solid': 2, 'testing-strategy': 1,
      // Backend — some integration
      'spring-boot': 0, 'jpa-hibernate': 0, 'ddd': 1, 'api-design': 2,
      'messaging': 1, 'bpm-orchestration': 0, 'postgresql': 1, 'redis': 0,
      'integration-contract-testing': 0,
      // Domain — deep
      'reglementation-sociale': 5, 'processus-recouvrement': 5,
      'travailleurs-independants': 4, 'sante-ruamm': 3,
      'portail-pro': 2, 'gue-rue': 3, 'comptabilite-paiements': 4, 'si-legacy': 5,
      // Soft skills
      'vulgarisation-pedagogie': 3, 'mentoring': 3, 'cross-team-communication': 2,
      'problem-solving-debugging': 4, 'incident-response': 4, 'stakeholder-communication': 2,
      'agile-scrum': 1, 'code-review': 2,
      // Architecture — legacy focused
      'c4-structurizr': 0, 'adrs': 0, 'archimate': 1, 'technical-documentation': 3,
      'modular-microservices': 0, 'api-governance': 1, 'data-modeling': 4, 'urbanisation-si': 3,
    },
  },
  {
    name: 'Catherine ROUX',
    email: 'catherine.roux@example.com',
    posteId: 'poste-1-tech-lead-adelia',
    ratings: {
      // Legacy — expert + modernisation vision
      'adelia-rpg-4gl': 5, 'cl-control-language': 5, 'db2-400': 5,
      'legacy-diagnostic-mco': 5, 'batch-scheduling-operations': 4,
      'legacy-batch-interfaces': 5, 'legacy-modernisation': 5,
      'ibmi-as400-platform': 5, 'web-adelia': 5,
      // Core — some modern skills
      'java': 2, 'typescript': 1, 'python': 2, 'sql': 5,
      'bash-shell': 4, 'git-branching': 3, 'patterns-solid': 3, 'testing-strategy': 2,
      // Backend — basic
      'spring-boot': 1, 'jpa-hibernate': 0, 'ddd': 2, 'api-design': 3,
      'messaging': 2, 'bpm-orchestration': 1, 'postgresql': 2, 'redis': 0,
      'integration-contract-testing': 1,
      // Domain — expert
      'reglementation-sociale': 5, 'processus-recouvrement': 4,
      'travailleurs-independants': 5, 'sante-ruamm': 4,
      'portail-pro': 3, 'gue-rue': 4, 'comptabilite-paiements': 5, 'si-legacy': 5,
      // Soft skills — leadership
      'vulgarisation-pedagogie': 4, 'mentoring': 5, 'cross-team-communication': 4,
      'problem-solving-debugging': 5, 'incident-response': 5, 'stakeholder-communication': 4,
      'agile-scrum': 2, 'code-review': 3,
      // Architecture
      'c4-structurizr': 1, 'adrs': 1, 'archimate': 2, 'technical-documentation': 4,
      'modular-microservices': 1, 'api-governance': 2, 'data-modeling': 5, 'urbanisation-si': 4,
    },
  },

  // ── Fonctionnel / BA pole ──────────────────────────────
  {
    name: 'Isabelle PETIT',
    email: 'isabelle.petit@example.com',
    posteId: 'poste-7-business-analyst',
    ratings: {
      // Analyse fonctionnelle — core strength
      'cross-domain-coordination': 4, 'data-dictionary-referentials': 4,
      'gap-analysis-legacy': 3, 'regulatory-interpretation': 5,
      'process-modeling': 5, 'functional-testing': 4,
      'functional-specifications': 5, 'requirements-elicitation': 5,
      // PMO
      'dependency-coordination': 3, 'stakeholder-engagement': 4,
      'risk-management': 3, 'procurement-contracts': 1,
      'scope-change-control': 3, 'planning-scheduling': 3,
      'governance-reporting': 3, 'budget-financial-tracking': 2,
      // Change management
      'external-user-accompaniment': 4, 'training-delivery': 4,
      'change-communication': 4, 'training-design': 3,
      'impact-analysis': 4, 'adoption-measurement': 3, 'stakeholder-network': 3,
      // Design UX
      'accessibility-rgaa': 2, 'information-architecture': 3, 'ux-design': 3,
      'ui-design-prototyping': 2, 'service-design': 2, 'user-research': 3,
      'ux-writing': 2, 'usability-testing': 3,
      // Domain
      'reglementation-sociale': 4, 'processus-recouvrement': 4,
      'travailleurs-independants': 3, 'sante-ruamm': 5,
      'portail-pro': 3, 'gue-rue': 2, 'comptabilite-paiements': 2, 'si-legacy': 2,
      // Soft skills
      'vulgarisation-pedagogie': 4, 'mentoring': 3, 'cross-team-communication': 4,
      'problem-solving-debugging': 3, 'incident-response': 1, 'stakeholder-communication': 5,
      'agile-scrum': 3, 'code-review': 1,
      // Transverse — some data governance
      'bi-reporting': 3, 'data-governance-compliance': 3, 'data-modeling-conceptual': 3,
      'data-quality': 2,
    },
  },
  {
    name: 'David LAMBERT',
    email: 'david.lambert@example.com',
    posteId: 'poste-7-business-analyst',
    ratings: {
      // Analyse fonctionnelle — more data-oriented BA
      'cross-domain-coordination': 3, 'data-dictionary-referentials': 5,
      'gap-analysis-legacy': 4, 'regulatory-interpretation': 3,
      'process-modeling': 4, 'functional-testing': 3,
      'functional-specifications': 4, 'requirements-elicitation': 4,
      // PMO
      'dependency-coordination': 2, 'stakeholder-engagement': 3,
      'risk-management': 2, 'procurement-contracts': 1,
      'scope-change-control': 2, 'planning-scheduling': 2,
      'governance-reporting': 2, 'budget-financial-tracking': 1,
      // Change management — basic
      'external-user-accompaniment': 2, 'training-delivery': 2,
      'change-communication': 2, 'training-design': 1,
      'impact-analysis': 3, 'adoption-measurement': 2, 'stakeholder-network': 2,
      // Domain
      'reglementation-sociale': 3, 'processus-recouvrement': 3,
      'travailleurs-independants': 4, 'sante-ruamm': 2,
      'portail-pro': 2, 'gue-rue': 3, 'comptabilite-paiements': 3, 'si-legacy': 3,
      // Soft skills
      'vulgarisation-pedagogie': 3, 'mentoring': 2, 'cross-team-communication': 3,
      'problem-solving-debugging': 3, 'incident-response': 1, 'stakeholder-communication': 3,
      'agile-scrum': 3, 'code-review': 1,
      // Transverse — strong data skills (unique differentiator)
      'bi-reporting': 4, 'etl-pipelines': 3, 'data-governance-compliance': 4,
      'mdm-referentials': 4, 'data-migration-legacy': 3, 'data-modeling-conceptual': 4,
      'data-quality': 4,
      'sql': 3, 'python': 2,
    },
  },
]

// ─── Main ────────────────────────────────────────────────
async function main() {
  console.log(`Creating ${candidates.length} candidates...\n`)

  for (const spec of candidates) {
    console.log(`Creating ${spec.name} → ${spec.posteId}...`)

    // Create candidate directly
    const createRes = await fetch(`${API_BASE}/api/recruitment/intake`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Secret': process.env.DRUPAL_WEBHOOK_SECRET || 'dev-secret',
      },
      body: JSON.stringify({
        nom: spec.name.split(' ').slice(1).join(' '),
        prenom: spec.name.split(' ')[0],
        email: spec.email,
        poste_vise: spec.posteId,
        canal: 'site',
        message: `Candidature de test pour ${spec.name}`,
      }),
    })

    if (!createRes.ok) {
      // Intake might not be available, try direct candidate creation
      console.log(`  Intake failed (${createRes.status}), trying direct creation...`)

      // Try the candidates API
      const directRes = await fetch(`${API_BASE}/api/candidates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: spec.name,
          roleId: spec.posteId.replace(/^poste-\d+-/, ''),
          email: spec.email,
        }),
      })

      if (!directRes.ok) {
        console.error(`  FAILED: ${directRes.status} ${await directRes.text()}`)
        continue
      }

      const created = await directRes.json()
      console.log(`  Created candidate ${created.id}`)

      // Save ratings via evaluate endpoint
      const evalRes = await fetch(`${API_BASE}/api/evaluate/${created.id}/ratings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ratings: spec.ratings,
          experience: {},
          skippedCategories: [],
        }),
      })

      if (!evalRes.ok) {
        console.error(`  FAILED to save ratings: ${evalRes.status}`)
        continue
      }

      // Submit evaluation
      const submitRes = await fetch(`${API_BASE}/api/evaluate/${created.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (submitRes.ok) {
        const ratingCount = Object.keys(spec.ratings).length
        console.log(`  OK: ${ratingCount} ratings submitted`)
      } else {
        console.error(`  FAILED to submit: ${submitRes.status} ${await submitRes.text()}`)
      }
      continue
    }

    const intakeResult = await createRes.json()
    console.log(`  Created via intake: candidature=${intakeResult.candidatureId}, candidate=${intakeResult.candidateId}`)

    // Save ratings via evaluate endpoint
    const evalRes = await fetch(`${API_BASE}/api/evaluate/${intakeResult.candidateId}/ratings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ratings: spec.ratings,
        experience: {},
        skippedCategories: [],
      }),
    })

    if (!evalRes.ok) {
      console.error(`  FAILED to save ratings: ${evalRes.status} ${await evalRes.text()}`)
      continue
    }

    // Advance candidature to skill_radar_envoye then submit
    // First preselect
    await fetch(`${API_BASE}/api/recruitment/candidatures/${intakeResult.candidatureId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statut: 'preselectionne', notes: 'Auto-présélectionné (seed)' }),
    })

    // Send skill radar
    await fetch(`${API_BASE}/api/recruitment/candidatures/${intakeResult.candidatureId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statut: 'skill_radar_envoye', sendEmail: false }),
    })

    // Submit evaluation (this auto-advances to skill_radar_complete)
    const submitRes = await fetch(`${API_BASE}/api/evaluate/${intakeResult.candidateId}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })

    if (submitRes.ok) {
      const ratingCount = Object.keys(spec.ratings).length
      console.log(`  OK: ${ratingCount} ratings, submitted + advanced to skill_radar_complete`)
    } else {
      console.error(`  FAILED to submit: ${submitRes.status} ${await submitRes.text()}`)
    }
  }

  console.log('\nDone! All candidates seeded.')
}

main().catch(console.error)
