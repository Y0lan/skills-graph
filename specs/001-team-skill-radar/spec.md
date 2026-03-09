# Feature Specification: Team Skill Radar

**Feature Branch**: `001-team-skill-radar`
**Created**: 2026-03-09
**Status**: Draft
**Input**: User description: "A local website to collect team members' tech skill ratings via a form and display them as a radar graph to visualize strengths and weaknesses"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Submit Skill Self-Assessment via Personal Link (Priority: P1)

Each team member receives a unique personal link (e.g.,
`/form/yolan-maldonado`) sent to them individually. When they
open it, their name and role are already displayed — no need
to type anything.

The form is a **multi-step wizard** (one category per step):
- 9 steps, one per skill category, with a progress bar
  (e.g., "Step 3/9 — Frontend & UI Engineering")
- Each step shows 6-9 skills for that category
- Each step begins with a **calibration prompt** (a short
  scenario) to prime honest self-assessment
- Rating input: a row of buttons per skill —
  `?` (unknown/0) `1` `2` `3` `4` `5`
- Each skill also collects an **experience duration**:
  0=Never, 1=<6 months, 2=6m–2y, 3=2–5y, 4=5+ years
- A **rating scale legend** is always visible on the form,
  showing what each level means (0=Unknown, 1=Awareness,
  2=Guided, 3=Autonomous, 4=Advanced, 5=Expert)
- Each skill has **anchored level descriptions** (specific
  to that technology) shown as tooltips or expandable hints
  so people rate consistently
- A **"Skip this category"** button per step marks all skills
  in that category as -2 (explicitly skipped, excluded from
  all averages and gap metrics)
- "Next" / "Back" buttons navigate between steps
- "Submit" on the last step saves all ratings at once
- Progress is preserved between steps (no data loss on
  navigation)

Their ratings are saved immediately on submit.

The team roster is predefined in the system:

**Ingénierie Technique** (managed by Pierre ROSSATO):
- Yolan MALDONADO — Architecte Technique Logiciel
- Alexandre THOMAS — Architecte Technique Logiciel
- Alan HUITEL — Ingénieur DevOps
- Pierre-Mathieu BARRAS — Ingénieur DevOps / Développeur
- Andy MALO — Ingénieur Data

**Développement** (managed by Pierre ROSSATO):
- Steven NGUYEN — Développeur Full Stack
- Matthieu ALCIME — Développeur Full Stack
- Martin VALLET — Développeur Full Stack
- Nicole NGUON — Développeuse Full Stack

**QA & Automatisation** (supervised by Olivier FAIVRE):
- Bethlehem MENGISTU — Ingénieure QA

**Management**:
- Pierre ROSSATO — Lead Développeur (Manager MOE)

**Why this priority**: Without data collection, nothing else
works. The personal link removes friction — no login, no
name entry.

**Independent Test**: Open a personal link, see your name
pre-filled, rate skills, submit, and see confirmation.

**Acceptance Scenarios**:

1. **Given** a team member opens their personal link, **When**
   the page loads, **Then** their name and role are displayed
   and the skill form is ready to fill.
2. **Given** a team member has already submitted, **When**
   they reopen their link, **Then** their previous ratings
   are pre-filled so they can update them.
3. **Given** a team member leaves some skill ratings at 0
   (unknown/never used), **When** they submit, **Then** those
   skills are stored as 0 and excluded from team averages.
4. **Given** a link with an unknown slug (not in the roster),
   **When** someone opens it, **Then** a friendly error page
   is shown.

---

### User Story 2 - View Team & Category Radar Graphs (Priority: P1)

The dashboard is designed as a **decision-making tool for
managers and architects**. It answers: "Where is the team
strong?", "Where are the gaps?", "Who can I assign to X?",
and "What training do we need?".

The dashboard layout (top to bottom):

1. **Personal overview radar** (pinned at top if personal
   link) — 9 axes (one per category), showing the viewer's
   average score per category.
2. **Team overview radar** — same 9 axes showing team
   averages, overlaid with the viewer's line for instant
   "me vs team" comparison.
3. **Category summary cards** — 9 cards, each showing:
   team strength (avg), coverage (how many members scored
   3+ in at least one skill), top skill, weakest skill.
4. **Category deep-dive radars** — 9 charts, one per
   category, with individual skills as axes. Shows team
   average line + viewer's line overlaid.
5. **Skills gap table** — tabular view: rows = skills,
   columns = team avg, number of people at 3+, highest/
   lowest rater. Sortable. Color-coded: red (0-1 people
   at 3+, bus factor risk), yellow (2-3), green (4+).
6. **Team members grid** — cards for each of the 11 members
   with a mini 9-axis radar + name + role. Members who
   haven't submitted are greyed out.

**Why this priority**: This is the core value proposition —
visualizing where the team is strong and where gaps exist,
organized by domain, in a way that supports staffing and
training decisions.

**Independent Test**: After at least two members have
submitted, the dashboard shows all 6 sections with correct
averaged values and the viewer's chart at the top.

**Acceptance Scenarios**:

1. **Given** the viewer has submitted ratings, **When** they
   open their personal dashboard link, **Then** their
   personal overview radar appears at the top.
2. **Given** ratings exist, **When** viewing the dashboard,
   **Then** the team overview radar shows 9 category axes
   with team averages and the viewer's overlay.
3. **Given** ratings exist, **When** viewing category summary
   cards, **Then** each card shows avg strength, coverage
   count, top skill, and weakest skill.
4. **Given** ratings exist, **When** viewing the category
   deep-dive section, **Then** 9 radars display with
   individual skill axes and team avg + viewer overlay.
5. **Given** ratings exist, **When** viewing the skills gap
   table, **Then** skills are listed with avg, coverage
   count, and color-coded risk indicators.
6. **Given** the viewer opens the dashboard, **When** scrolling
   to the team members grid, **Then** they see mini radar
   cards for every member.
7. **Given** a member has not submitted yet, **When** viewing
   the team members grid, **Then** their card is greyed out
   with no radar.
8. **Given** no data has been submitted yet, **When** a user
   views the dashboard, **Then** an empty state message
   encourages team members to fill in the form.
9. **Given** someone opens `/dashboard` without a member slug,
   **When** the page loads, **Then** all charts are shown
   without any personal overlay or pinning.

---

### User Story 3 - Toggle Dark/Light Mode (Priority: P3)

A user can switch between dark and light themes. The
preference persists across page reloads via local storage.

**Why this priority**: Polish feature that improves comfort
but does not affect core functionality.

**Independent Test**: Toggle the theme switch and verify the
UI updates. Reload the page and confirm the preference
persists.

**Acceptance Scenarios**:

1. **Given** the app is in light mode, **When** the user
   clicks the theme toggle, **Then** the app switches to dark
   mode immediately.
2. **Given** a user sets dark mode, **When** they reload the
   page, **Then** the app opens in dark mode.

---

### Edge Cases

- What happens if the skill category list changes after
  people have submitted? Existing data is preserved; new
  skills show as 0 for previous submissions.
- What happens if a team member is removed from the roster?
  Their submitted data remains visible in the dashboard.
- What happens if someone accesses `/dashboard` without a
  member slug? They see all team and individual graphs but
  no chart is pinned at the top.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a unique URL per team member
  (e.g., `/form/yolan-maldonado`) that opens their personal
  skill assessment form with name and role pre-filled.
- **FR-002**: System MUST present skills grouped by 9
  categories, each with its own skills. Each skill is rated
  0-5 (0 = unknown/never used). The full skill catalog is:
  - **Core Engineering**: Java, TypeScript, Python, SQL,
    Bash/Shell, Git & branching strategies, Patterns (SOLID,
    Clean Code)
  - **Backend & Integration Services**: Spring Boot (REST,
    Validation, Scheduling), JPA/Hibernate, DDD,
    API Design (REST, versioning, OpenAPI),
    Messaging (Kafka/Redpanda, RabbitMQ),
    BPM/Orchestration (Camunda, Temporal, Kestra),
    PostgreSQL (CloudNativePG), Redis/Dragonfly
  - **Frontend & UI Engineering**: Angular, RxJS, HTML/CSS/SCSS,
    State management (NgRx or equivalent),
    Component libraries (PrimeNG, AG Grid),
    Accessibility & Design System
  - **Platform Engineering**: GitLab CI, Docker/Podman,
    Kubernetes (RKE2/EKS), Helm/Kustomize,
    Terraform/OpenTofu, Ansible,
    Artifact registries (Harbor/Nexus)
  - **Observability & Reliability**: Prometheus, Grafana,
    Loki/Elasticsearch, Tempo/OpenTelemetry, Sentry,
    SLO/SLA/Alerting, Capacity planning & resilience patterns
  - **Security & Compliance**: IAM (Keycloak, OAuth2/OIDC),
    Secret management (Vault),
    Supply chain (Trivy, Snyk, Dependency-Track),
    Code security (Gitleaks, CI scanning), MFA/YubiKey,
    Encryption (TLS, key rotation),
    Threat modeling & API security
  - **Architecture, Governance & Delivery**: C4 (Structurizr),
    ADRs, ArchiMate (Archi),
    Technical documentation (OpenAPI, specs), Agile/Scrum,
    Code review, Modular/microservices/hexagonal design,
    API governance, Data modeling (canonical models, DDD
    aggregates)
  - **Soft Skills & Collaboration**: Technical writing (specs,
    ADRs, runbooks), Mentoring & knowledge transfer,
    Cross-team communication,
    Problem-solving & debugging methodology,
    Incident response & postmortem,
    Stakeholder communication
  - **Domain Knowledge (CAFAT/SINAPSE)**: Réglementation
    sociale NC, Processus Recouvrement,
    Travailleurs Indépendants, Santé/RUAMM,
    Portail Pro & télé-services, GUE/RUE,
    Comptabilité & Paiements, SI Legacy CAFAT,
    Urbanisation SI
- **FR-003**: System MUST persist submitted ratings so they
  survive page reloads and server restarts.
- **FR-004**: System MUST allow users to update their ratings
  by revisiting their personal link (upsert behavior).
- **FR-005**: System MUST display a dashboard with multiple
  radar charts — one per skill category — showing team
  averages. Averages MUST only include members who rated
  the skill (score > 0); members with 0 (unknown/never
  used) are excluded from the calculation.
- **FR-006**: System MUST provide a personal dashboard URL per
  team member (e.g., `/dashboard/yolan-maldonado`) that pins
  their individual radar chart at the top. A generic
  `/dashboard` URL shows all charts without pinning.
- **FR-007**: System MUST display individual radar charts for
  every team member below the team-level charts.
- **FR-008**: System MUST support dark mode and light mode
  with a user-togglable theme switcher.
- **FR-009**: System MUST show an empty/onboarding state when
  no data has been submitted yet.
- **FR-010**: System MUST include the full predefined team
  roster (11 members across 4 sub-teams) with names, roles,
  and team assignments hardcoded.
- **FR-011**: The form MUST use a multi-step wizard (one
  category per step, 9 steps total) with a progress bar,
  "Next"/"Back" navigation, and "Submit" on the last step.
- **FR-012**: The form MUST display an always-visible rating
  scale legend: 0=Unknown, 1=Awareness, 2=Guided,
  3=Autonomous, 4=Advanced, 5=Expert.
- **FR-013**: Each skill MUST have anchored level descriptions
  (specific to that technology) shown as tooltips or
  expandable hints on the form. See `skill-descriptors.md`
  for the full catalog.
- **FR-014**: The rating input for each skill MUST be a row
  of buttons: `?` (0), `1`, `2`, `3`, `4`, `5`.
- **FR-015**: The dashboard MUST display a team overview radar
  (9 category axes) with the viewer's line overlaid when
  using a personal dashboard link.
- **FR-016**: The dashboard MUST display 9 category summary
  cards showing: team avg strength, coverage (members with
  at least one skill at 3+), top skill, weakest skill.
- **FR-017**: The dashboard MUST display 9 category deep-dive
  radars with individual skill axes showing team average
  and viewer overlay.
- **FR-018**: The dashboard MUST display a sortable skills gap
  table with columns: skill name, team avg, count of members
  at 3+, highest rater, lowest rater. Rows MUST be
  color-coded: red (0-1 at 3+), yellow (2-3), green (4+).
- **FR-019**: The dashboard MUST display a team members grid
  with mini 9-axis radar cards per member. Members who have
  not submitted are greyed out.
- **FR-020**: The form MUST collect an experience duration per
  skill alongside the proficiency rating. Options: 0=Never,
  1=Less than 6 months, 2=6 months–2 years, 3=2–5 years,
  4=5+ years.
- **FR-021**: The form MUST offer a "Skip this category" button
  per wizard step that marks all skills in that category as -2
  (explicitly skipped, distinct from -1=not submitted). Skipped
  skills are excluded from all averages and gap metrics.
- **FR-022**: Each category step in the wizard MUST display a
  calibration prompt (a short scenario) before the skill
  ratings, to prime honest self-assessment.

### Key Entities

- **TeamMember**: A person on the team. Has a name, role,
  sub-team, and a unique URL slug. Contains a set of skill
  ratings. Predefined in the system — not user-created.
- **SkillCategory**: One of 9 skill domains: Core Engineering,
  Backend & Integration Services, Frontend & UI Engineering,
  Platform Engineering, Observability & Reliability,
  Security & Compliance, Architecture Governance & Delivery,
  Soft Skills & Collaboration, Domain Knowledge (CAFAT/SINAPSE).
- **Skill**: A specific technology or practice within a
  category (e.g., "Spring Boot" in "Backend & Integration
  Services", "Kubernetes" in "Platform Engineering"). See
  FR-002 for the full catalog.
- **SkillRating**: A numeric value representing a member's
  proficiency in a specific skill. Anchored scale:
  -2 = explicitly skipped category (excluded from all metrics),
  -1 = no reply (not submitted yet; not shown on charts),
  0 = unknown/never used (excluded from averages),
  1 = awareness, 2 = guided, 3 = autonomous, 4 = advanced,
  5 = expert. Each skill has technology-specific descriptions
  per level (see `skill-descriptors.md`).
- **ExperienceDuration**: Duration of active use for a skill.
  Scale: 0=Never, 1=<6 months, 2=6m–2y, 3=2–5y, 4=5+ years.
  Collected alongside proficiency rating.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A team member can open their personal link and
  complete the skill form in under 15 minutes (~65 skills
  across 9 categories with experience duration per skill).
- **SC-002**: The radar charts accurately reflect submitted
  data — manual average calculations match displayed values.
- **SC-003**: All submitted data persists across application
  restarts without data loss.
- **SC-004**: The dashboard loads and renders all radar charts
  within 2 seconds on a local network.
- **SC-005**: Both dark and light themes are visually
  consistent — no broken layouts, unreadable text, or
  missing contrast.
- **SC-006**: All 11 team members can submit data without
  performance degradation.

## Clarifications

### Session 2026-03-09

- Q: How does the dashboard identify the viewer to pin their chart? → A: Personal dashboard link per member (e.g., `/dashboard/yolan-maldonado`), consistent with the form link pattern.
- Q: What specific skills should be in each category? → A: 9 categories with 6-9 skills each (~65 total), tailored to the SINAPSE Java/Angular/K8s stack plus soft skills and domain knowledge. Full list integrated into FR-002.
- Q: How should team averages handle unrated skills? → A: Average only members who rated (score > 0). Score 0 = unknown/never used (excluded from averages). Score -1 = no reply/not submitted (not shown on charts at all).
- Q: What form UX for ~65 skills? → A: Multi-step wizard (9 steps, one per category), button row rating (?/1-5), always-visible legend, per-skill anchored descriptions as tooltips.
- Q: What dashboard layout for managers? → A: 6 sections — personal overview (9-axis), team overview with viewer overlay (9-axis), 9 category summary cards, 9 category deep-dive radars, skills gap table (sortable, color-coded risk), team members grid with mini 9-axis radars.
- Q: What about soft skills and domain knowledge? → A: Added category 8 (Soft Skills, 6 skills) and category 9 (Domain Knowledge CAFAT/SINAPSE, 9 skills).
- Q: How to improve data quality beyond self-rating? → A: Added experience duration per skill (second axis) + calibration prompts per category + "Skip this category" button (stored as -2).

## Assumptions

- The team roster (11 members) is hardcoded in the
  application. Adding or removing members requires a code
  change.
- Skill categories (9) and individual skills (~65 total) are
  predefined in code. The full catalog is defined in FR-002.
- The rating scale is 0-5: 0 = unknown/never used (excluded
  from averages), 1 = awareness, 5 = expert. -1 = no reply
  (member has not submitted yet; does not affect charts).
- No authentication — the personal link is the only
  identity mechanism. Anyone with a link can submit for
  that person.
- The app runs locally on one machine and is accessed by
  colleagues over a local network.
- Data volume is small (11 members) so a flat JSON file is
  sufficient for storage.
