#!/usr/bin/env node
/**
 * Seed role_categories + team evaluations on the dev DB so the /recruit
 * pipeline surfaces meaningful POSTE + ÉQUIPE scores.
 *
 * Two things:
 *   Part A — role_categories: fills categories for 5 Sinapse roles that
 *            currently show "aucune catégorie". Derived from the fiches
 *            de poste PDFs. INSERT OR IGNORE so existing rows stay.
 *   Part B — evaluations: generates realistic skill ratings per team
 *            member using per-role profiles (copied from seed-ratings.ts
 *            so this script stays self-contained). SKIPS any slug that
 *            already has submitted_at IS NOT NULL — preserves real data.
 *
 * Standalone ESM, runs inside the pod (prod deps only: better-sqlite3).
 * Usage: node scripts/seed-dev-compat.mjs <db-path>
 * Safe to re-run — idempotent on roles, skip-if-submitted on evals.
 */

import Database from 'better-sqlite3'

// ─────────────────────── Part A: role_categories ────────────────────────

const ROLE_CATEGORIES = {
  'architecte-si': [
    'architecture-governance', 'core-engineering', 'backend-integration',
    'platform-engineering', 'security-compliance', 'observability-reliability',
    'soft-skills-delivery', 'domain-knowledge',
  ],
  'business-analyst': [
    'analyse-fonctionnelle', 'domain-knowledge', 'project-management-pmo',
    'change-management-training', 'soft-skills-delivery', 'data-engineering-governance',
  ],
  'dev-java-fullstack': [
    'javaee-jboss', 'core-engineering', 'backend-integration', 'frontend-ui',
    'platform-engineering', 'observability-reliability', 'soft-skills-delivery',
  ],
  'tech-lead-java': [
    'architecture-governance', 'javaee-jboss', 'core-engineering',
    'backend-integration', 'platform-engineering', 'management-leadership',
    'soft-skills-delivery', 'observability-reliability',
  ],
  'dev-jboss-senior': [
    'javaee-jboss', 'core-engineering', 'backend-integration',
    'platform-engineering', 'observability-reliability', 'soft-skills-delivery',
  ],
}

// ─────────────────────── Part B: team evaluations ───────────────────────
// Copied verbatim from scripts/seed-ratings.ts so this script has no
// devDep imports (tsx isn't in the pod image).

const MEMBERS = [
  { slug: 'yolan-maldonado', role: 'architect' },
  { slug: 'alexandre-thomas', role: 'architect' },
  { slug: 'alan-huitel', role: 'devops' },
  { slug: 'pierre-mathieu-barras', role: 'devops-dev' },
  { slug: 'andy-malo', role: 'data' },
  { slug: 'steven-nguyen', role: 'fullstack' },
  { slug: 'matthieu-alcime', role: 'fullstack' },
  { slug: 'martin-vallet', role: 'fullstack' },
  { slug: 'nicole-nguon', role: 'fullstack' },
  { slug: 'bethlehem-mengistu', role: 'qa' },
  { slug: 'pierre-rossato', role: 'lead' },
  { slug: 'nicolas-dufillot', role: 'ba' },
  { slug: 'nicolas-eppe', role: 'ba' },
  { slug: 'leila-benakezouh', role: 'ba' },
  { slug: 'sonalie-taconet', role: 'ba' },
  { slug: 'amine-bouali', role: 'ba' },
  { slug: 'audrey-queau', role: 'ba' },
  { slug: 'olivier-faivre', role: 'direction' },
  { slug: 'guillaume-benoit', role: 'direction' },
]

const CATEGORIES = {
  'core-engineering': ['java','typescript','python','sql','bash-shell','git-branching','patterns-solid','testing-strategy'],
  'backend-integration': ['spring-boot','jpa-hibernate','ddd','api-design','messaging','bpm-orchestration','postgresql','redis','integration-contract-testing'],
  'frontend-ui': ['angular','rxjs','html-css-scss','state-management','component-libraries','accessibility-design-system','frontend-testing'],
  'platform-engineering': ['gitlab-ci','docker-podman','kubernetes','helm-kustomize','gitops','terraform-opentofu','ansible','artifact-registries','object-storage'],
  'observability-reliability': ['prometheus','grafana','loki-elasticsearch','tempo-opentelemetry','error-tracking','slo-sla-alerting','capacity-resilience'],
  'security-compliance': ['iam-authn','secret-management','supply-chain','code-security','encryption-tls','network-security-zerotrust','threat-modeling'],
  'architecture-governance': ['c4-structurizr','adrs','archimate','technical-documentation','modular-microservices','api-governance','data-modeling','urbanisation-si'],
  'soft-skills-delivery': ['vulgarisation-pedagogie','mentoring','cross-team-communication','problem-solving-debugging','incident-response','stakeholder-communication','agile-scrum','code-review'],
  'domain-knowledge': ['reglementation-sociale','processus-recouvrement','travailleurs-independants','sante-ruamm','portail-pro','gue-rue','comptabilite-paiements','si-legacy'],
  'ai-engineering': ['prompt-engineering','ai-assistants','coding-assistants','rag-knowledge-bases','llm-local-inference','llm-api-integration','ai-project-management','ai-ethics-governance'],
  'qa-test-engineering': ['test-strategy','test-automation-frameworks','e2e-functional-testing','performance-load-testing','test-data-management','test-environments','defect-management'],
  'analyse-fonctionnelle': ['cross-domain-coordination','data-dictionary-referentials','gap-analysis-legacy','regulatory-interpretation','process-modeling','functional-testing','functional-specifications','requirements-elicitation'],
  'project-management-pmo': ['dependency-coordination','stakeholder-engagement','risk-management','procurement-contracts','scope-change-control','planning-scheduling','governance-reporting','budget-financial-tracking'],
  'change-management-training': ['external-user-accompaniment','training-delivery','change-communication','training-design','impact-analysis','adoption-measurement','stakeholder-network'],
  'design-ux': ['accessibility-rgaa','information-architecture','ux-design','ui-design-prototyping','service-design','user-research','ux-writing','usability-testing'],
  'data-engineering-governance': ['bi-reporting','etl-pipelines','data-governance-compliance','mdm-referentials','data-migration-legacy','data-modeling-conceptual','data-quality'],
  'management-leadership': ['coaching-development','management-communication','team-management','change-management-legacy','multi-stakeholder-piloting','strategic-planning','recruiting-onboarding','knowledge-transfer-run'],
  'legacy-ibmi-adelia': ['adelia-rpg-4gl','cl-control-language','db2-400','legacy-diagnostic-mco','batch-scheduling-operations','legacy-batch-interfaces','legacy-modernisation','ibmi-as400-platform','web-adelia'],
  'javaee-jboss': ['jboss-wildfly','ejb-javaee','jms-messaging-legacy','jndi-datasources','servlets-jsp','migration-legacy-moderne','api-wrapping-legacy'],
  'infrastructure-systems-network': ['linux-administration','messaging-collaboration-m365','network-switching-routing','backup-disaster-recovery','storage-san-nas','monitoring-supervision','security-perimeter','vmware-virtualization','windows-ad','cdc-realtime-sync'],
}

const PROFILES = {
  architect: { 'core-engineering':0.85,'backend-integration':0.80,'frontend-ui':0.45,'platform-engineering':0.60,'observability-reliability':0.65,'security-compliance':0.70,'architecture-governance':0.90,'soft-skills-delivery':0.80,'domain-knowledge':0.55,'ai-engineering':0.65,'qa-test-engineering':0.40,'project-management-pmo':0.35,'data-engineering-governance':0.30,'management-leadership':0.40 },
  devops: { 'core-engineering':0.55,'backend-integration':0.30,'frontend-ui':0.15,'platform-engineering':0.95,'observability-reliability':0.85,'security-compliance':0.70,'architecture-governance':0.45,'soft-skills-delivery':0.55,'domain-knowledge':0.20,'ai-engineering':0.30,'qa-test-engineering':0.35,'infrastructure-systems-network':0.60 },
  'devops-dev': { 'core-engineering':0.65,'backend-integration':0.50,'frontend-ui':0.25,'platform-engineering':0.80,'observability-reliability':0.70,'security-compliance':0.60,'architecture-governance':0.45,'soft-skills-delivery':0.50,'domain-knowledge':0.25,'ai-engineering':0.35,'qa-test-engineering':0.40,'infrastructure-systems-network':0.45 },
  data: { 'core-engineering':0.60,'backend-integration':0.40,'frontend-ui':0.15,'platform-engineering':0.50,'observability-reliability':0.45,'security-compliance':0.35,'architecture-governance':0.40,'soft-skills-delivery':0.50,'domain-knowledge':0.30,'ai-engineering':0.55,'qa-test-engineering':0.30,'data-engineering-governance':0.65 },
  fullstack: { 'core-engineering':0.70,'backend-integration':0.70,'frontend-ui':0.75,'platform-engineering':0.35,'observability-reliability':0.40,'security-compliance':0.40,'architecture-governance':0.50,'soft-skills-delivery':0.55,'domain-knowledge':0.50,'ai-engineering':0.35,'qa-test-engineering':0.45,'design-ux':0.25 },
  qa: { 'core-engineering':0.45,'backend-integration':0.30,'frontend-ui':0.35,'platform-engineering':0.40,'observability-reliability':0.50,'security-compliance':0.55,'architecture-governance':0.40,'soft-skills-delivery':0.60,'domain-knowledge':0.45,'ai-engineering':0.25,'qa-test-engineering':0.85,'analyse-fonctionnelle':0.30,'change-management-training':0.25 },
  lead: { 'core-engineering':0.75,'backend-integration':0.70,'frontend-ui':0.55,'platform-engineering':0.50,'observability-reliability':0.55,'security-compliance':0.60,'architecture-governance':0.80,'soft-skills-delivery':0.90,'domain-knowledge':0.65,'ai-engineering':0.40,'qa-test-engineering':0.50,'management-leadership':0.75,'project-management-pmo':0.50,'change-management-training':0.35 },
  ba: { 'analyse-fonctionnelle':0.85,'project-management-pmo':0.65,'change-management-training':0.60,'design-ux':0.45,'data-engineering-governance':0.55,'management-leadership':0.40,'architecture-governance':0.50,'soft-skills-delivery':0.80,'domain-knowledge':0.75,'core-engineering':0.20,'backend-integration':0.15,'frontend-ui':0.10,'qa-test-engineering':0.30,'ai-engineering':0.20 },
  direction: { 'management-leadership':0.90,'architecture-governance':0.55,'soft-skills-delivery':0.95,'domain-knowledge':0.70,'project-management-pmo':0.60,'core-engineering':0.15,'backend-integration':0.10 },
}

const OVERRIDES = {
  'yolan-maldonado': { 'typescript':5,'java':5,'ddd':5,'api-design':5,'c4-structurizr':5,'adrs':5,'code-review':5,'patterns-solid':5,'modular-microservices':5,'angular':2,'rxjs':2 },
  'alexandre-thomas': { 'java':5,'spring-boot':5,'jpa-hibernate':5,'postgresql':5,'api-design':5,'ddd':4,'docker-podman':4,'code-review':5,'angular':3,'typescript':4 },
  'alan-huitel': { 'kubernetes':5,'docker-podman':5,'terraform-opentofu':5,'ansible':5,'gitlab-ci':5,'prometheus':5,'grafana':5,'helm-kustomize':5,'bash-shell':5,'java':1,'angular':0,'rxjs':0 },
  'pierre-mathieu-barras': { 'docker-podman':5,'gitlab-ci':5,'kubernetes':4,'java':3,'spring-boot':3,'typescript':3,'bash-shell':4,'ansible':4 },
  'andy-malo': { 'python':5,'sql':5,'postgresql':4,'java':2,'typescript':2,'angular':0,'bash-shell':4,'data-modeling':4 },
  'steven-nguyen': { 'angular':5,'rxjs':4,'typescript':4,'html-css-scss':4,'java':4,'spring-boot':4,'state-management':4,'kubernetes':1,'terraform-opentofu':0 },
  'matthieu-alcime': { 'java':4,'spring-boot':4,'angular':4,'typescript':4,'jpa-hibernate':4,'postgresql':3,'kubernetes':1,'docker-podman':2 },
  'martin-vallet': { 'angular':4,'rxjs':4,'typescript':4,'html-css-scss':5,'component-libraries':4,'accessibility-design-system':4,'java':3,'spring-boot':3,'kubernetes':0,'terraform-opentofu':0 },
  'nicole-nguon': { 'angular':4,'typescript':4,'java':4,'spring-boot':3,'html-css-scss':4,'state-management':3,'rxjs':3,'agile-scrum':4,'kubernetes':1 },
  'bethlehem-mengistu': { 'code-security':4,'error-tracking':4,'agile-scrum':4,'vulgarisation-pedagogie':4,'java':2,'angular':2,'typescript':2,'kubernetes':0,'terraform-opentofu':0,'ansible':0,'test-strategy':5,'test-automation-frameworks':4,'e2e-functional-testing':5,'defect-management':4 },
  'pierre-rossato': { 'java':5,'spring-boot':5,'angular':4,'typescript':4,'code-review':5,'mentoring':5,'stakeholder-communication':5,'agile-scrum':5,'cross-team-communication':5,'technical-documentation':4,'ddd':4,'kubernetes':2,'terraform-opentofu':1 },
  'nicolas-dufillot': { 'functional-specifications':5,'requirements-elicitation':5,'regulatory-interpretation':5,'process-modeling':4,'reglementation-sociale':5,'processus-recouvrement':5,'travailleurs-independants':4,'sante-ruamm':3,'stakeholder-communication':4,'agile-scrum':3,'data-modeling':3,'urbanisation-si':2 },
  'nicolas-eppe': { 'functional-specifications':4,'requirements-elicitation':4,'gap-analysis-legacy':5,'cross-domain-coordination':5,'data-dictionary-referentials':4,'si-legacy':4,'reglementation-sociale':3,'processus-recouvrement':4,'planning-scheduling':4,'risk-management':3,'sql':2,'data-modeling-conceptual':3 },
  'leila-benakezouh': { 'functional-specifications':5,'process-modeling':5,'functional-testing':5,'requirements-elicitation':4,'change-communication':4,'training-delivery':4,'sante-ruamm':5,'portail-pro':4,'ux-design':3,'usability-testing':3,'test-strategy':2,'e2e-functional-testing':2 },
  'sonalie-taconet': { 'requirements-elicitation':5,'regulatory-interpretation':4,'stakeholder-engagement':5,'change-communication':5,'training-design':4,'training-delivery':4,'impact-analysis':4,'comptabilite-paiements':4,'gue-rue':5,'stakeholder-communication':5,'mentoring':3 },
  'amine-bouali': { 'functional-specifications':4,'data-dictionary-referentials':5,'data-modeling-conceptual':4,'data-governance-compliance':4,'bi-reporting':3,'etl-pipelines':3,'reglementation-sociale':4,'travailleurs-independants':5,'sql':3,'python':2,'governance-reporting':4,'budget-financial-tracking':3 },
  'audrey-queau': { 'requirements-elicitation':4,'process-modeling':4,'information-architecture':4,'ux-design':4,'ui-design-prototyping':3,'user-research':4,'accessibility-rgaa':3,'service-design':3,'portail-pro':5,'sante-ruamm':3,'change-communication':3,'external-user-accompaniment':4 },
  'olivier-faivre': { 'strategic-planning':5,'multi-stakeholder-piloting':5,'team-management':4,'coaching-development':4,'management-communication':5,'recruiting-onboarding':4,'stakeholder-communication':5,'cross-team-communication':5,'agile-scrum':3,'mentoring':4,'reglementation-sociale':4,'processus-recouvrement':3,'urbanisation-si':3,'archimate':2,'governance-reporting':4,'budget-financial-tracking':4 },
  'guillaume-benoit': { 'strategic-planning':4,'multi-stakeholder-piloting':4,'team-management':5,'coaching-development':5,'management-communication':4,'knowledge-transfer-run':5,'change-management-legacy':4,'recruiting-onboarding':3,'stakeholder-communication':4,'cross-team-communication':4,'mentoring':5,'agile-scrum':3,'reglementation-sociale':3,'si-legacy':3,'risk-management':3,'scope-change-control':3 },
}

// ─── Seeded random (reproducible) ────
let seed = 42
function rnd() { seed = (seed * 1664525 + 1013904223) & 0x7fffffff; return seed / 0x7fffffff }
function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0; return Math.abs(h) }

function generateRating(strength, slug, skillId) {
  const r = rnd()
  const skillHash = hashStr(`${slug}:${skillId}`)
  const skillOffset = ((skillHash % 61) - 30) / 100
  const base = (strength + skillOffset) * 5
  const noisy = base + (r - 0.5) * 4
  return Math.max(0, Math.min(5, Math.round(noisy)))
}
function generateExperience(strength) {
  const r = rnd()
  const noisy = strength * 4 + (r - 0.5) * 3
  return Math.max(0, Math.min(4, Math.round(noisy)))
}

function generateMemberPayload(member) {
  const profile = PROFILES[member.role]
  if (!profile) return null
  const overrides = OVERRIDES[member.slug] ?? {}
  const ratings = {}
  for (const [catId, skills] of Object.entries(CATEGORIES)) {
    const strength = profile[catId]
    if (strength === undefined) continue
    for (const skillId of skills) {
      ratings[skillId] = overrides[skillId] !== undefined
        ? overrides[skillId]
        : generateRating(strength, member.slug, skillId)
    }
  }
  const experience = {}
  for (const catId of Object.keys(CATEGORIES)) {
    const strength = profile[catId]
    if (strength === undefined) continue
    experience[catId] = generateExperience(strength)
  }
  return { ratings, experience, skippedCategories: [] }
}

// ─── Main ────────────────────────────────────────────────
function main() {
  const dbPath = process.argv[2]
  const apply = !process.argv.includes('--dry-run')
  if (!dbPath) {
    console.error('usage: seed-dev-compat.mjs <db-path> [--dry-run]')
    process.exit(1)
  }
  console.log(`→ DB: ${dbPath}`)
  console.log(`→ mode: ${apply ? 'APPLY' : 'DRY-RUN'}\n`)

  const db = new Database(dbPath, { readonly: !apply })
  db.pragma('foreign_keys = ON')

  // ─── Part A: role_categories ──────────────────────────
  console.log('─── Part A: role_categories ───')
  const roleIds = new Set(db.prepare('SELECT id FROM roles').all().map(r => r.id))
  const categoryIds = new Set(db.prepare('SELECT id FROM categories').all().map(c => c.id))
  const existingPairs = new Set(
    db.prepare('SELECT role_id || \'|\' || category_id AS pair FROM role_categories').all().map(r => r.pair),
  )

  let inserted = 0, skipped = 0, missing = 0
  const insertRC = apply
    ? db.prepare('INSERT OR IGNORE INTO role_categories (role_id, category_id) VALUES (?, ?)')
    : null

  for (const [roleId, catIds] of Object.entries(ROLE_CATEGORIES)) {
    if (!roleIds.has(roleId)) {
      console.log(`  ! ${roleId} — role not found in DB, skipping`)
      missing++
      continue
    }
    for (const catId of catIds) {
      if (!categoryIds.has(catId)) {
        console.log(`  ! ${roleId} × ${catId} — category not found in DB, skipping`)
        missing++
        continue
      }
      const pair = `${roleId}|${catId}`
      if (existingPairs.has(pair)) { skipped++; continue }
      if (apply) insertRC.run(roleId, catId)
      inserted++
    }
  }
  console.log(`  inserted: ${inserted}, already present: ${skipped}, missing refs: ${missing}`)

  // ─── Part B: team evaluations ─────────────────────────
  console.log('\n─── Part B: team evaluations ───')

  // Check the candidates table is untouched — sanity guard.
  const candidatesCountBefore = db.prepare('SELECT COUNT(*) AS c FROM candidates').get().c
  console.log(`  candidates count before: ${candidatesCountBefore} (will be unchanged)`)

  const getExisting = db.prepare('SELECT slug, submitted_at FROM evaluations WHERE slug = ?')
  const upsertEval = apply
    ? db.prepare(`INSERT OR REPLACE INTO evaluations (slug, ratings, experience, skipped_categories, submitted_at)
                  VALUES (?, ?, ?, ?, datetime('now'))`)
    : null

  let seeded = 0, preserved = 0, noProfile = 0
  for (const member of MEMBERS) {
    const existing = getExisting.get(member.slug)
    if (existing?.submitted_at) { preserved++; continue }
    const payload = generateMemberPayload(member)
    if (!payload) {
      console.log(`  ! ${member.slug} — no profile for role '${member.role}', skipping`)
      noProfile++
      continue
    }
    if (apply) {
      upsertEval.run(
        member.slug,
        JSON.stringify(payload.ratings),
        JSON.stringify(payload.experience),
        JSON.stringify(payload.skippedCategories),
      )
    }
    seeded++
  }
  console.log(`  seeded: ${seeded}, preserved (already submitted): ${preserved}, no-profile: ${noProfile}`)

  const candidatesCountAfter = db.prepare('SELECT COUNT(*) AS c FROM candidates').get().c
  if (candidatesCountAfter !== candidatesCountBefore) {
    console.error(`\n!!! candidates count changed: ${candidatesCountBefore} → ${candidatesCountAfter} !!!`)
    process.exit(1)
  }
  console.log(`  candidates count after: ${candidatesCountAfter} (unchanged ✓)`)

  db.close()
  console.log(`\n[SEED] roles: ${inserted} filled, team radars: ${seeded} seeded, ${preserved} preserved, candidates: 0 touched`)
}

main()
