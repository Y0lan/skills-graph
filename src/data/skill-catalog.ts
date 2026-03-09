export interface LevelDescriptor {
  level: number
  label: string
  description: string
}

export interface Skill {
  id: string
  label: string
  categoryId: string
  descriptors: LevelDescriptor[]
}

export interface SkillCategory {
  id: string
  label: string
  emoji: string
  skills: Skill[]
}

function d(level: number, label: string, description: string): LevelDescriptor {
  return { level, label, description }
}

function descriptors(
  d0: string,
  d1: string,
  d2: string,
  d3: string,
  d4: string,
  d5: string,
): LevelDescriptor[] {
  return [
    d(0, 'Unknown', d0),
    d(1, 'Awareness', d1),
    d(2, 'Guided', d2),
    d(3, 'Autonomous', d3),
    d(4, 'Advanced', d4),
    d(5, 'Expert', d5),
  ]
}

export const skillCategories: SkillCategory[] = [
  // ─── 1. Core Engineering ───────────────────────────────
  {
    id: 'core-engineering',
    label: 'Core Engineering',
    emoji: '\uD83D\uDD25',
    skills: [
      {
        id: 'java',
        label: 'Java',
        categoryId: 'core-engineering',
        descriptors: descriptors(
          'Never written Java code',
          'Understand JVM basics, can read Java code',
          'Can fix bugs with help; knows collections, streams basics',
          'Writes idiomatic Java 17+; uses records, sealed classes, Optional',
          'Designs generic libraries; masters concurrency, GC tuning',
          'Defines team Java standards; leads JDK upgrade strategies',
        ),
      },
      {
        id: 'typescript',
        label: 'TypeScript',
        categoryId: 'core-engineering',
        descriptors: descriptors(
          'Never written TypeScript',
          'Knows TS adds types to JS; can read .ts files',
          'Uses basic types, interfaces; needs help with generics',
          'Writes strict TS; uses utility types, discriminated unions',
          'Designs shared type libraries; masters mapped/conditional types',
          'Defines team tsconfig standards; architects complex type systems',
        ),
      },
      {
        id: 'python',
        label: 'Python (scripts / ETL / dev tools)',
        categoryId: 'core-engineering',
        descriptors: descriptors(
          'Never written Python',
          'Can read simple scripts; knows pip basics',
          'Writes scripts with help; uses requests, pandas at basic level',
          'Builds CLI tools, ETL scripts; manages virtualenvs, packaging',
          'Creates reusable internal tooling; writes robust error handling',
          'Defines team Python tooling standards; architects ETL pipelines',
        ),
      },
      {
        id: 'sql',
        label: 'SQL',
        categoryId: 'core-engineering',
        descriptors: descriptors(
          'Never written SQL queries',
          'Understands SELECT, WHERE, JOIN concepts',
          'Writes basic queries; needs help with subqueries, indexes',
          'Writes complex joins, CTEs, window functions; reads EXPLAIN plans',
          'Optimizes slow queries; designs schemas with proper normalization',
          'Defines data modeling standards; masters PostgreSQL-specific SQL',
        ),
      },
      {
        id: 'bash-shell',
        label: 'Bash / Shell',
        categoryId: 'core-engineering',
        descriptors: descriptors(
          'Never written shell scripts',
          'Can run basic commands; understands pipes and redirects',
          'Writes simple scripts; needs help with loops, conditionals',
          'Writes robust scripts with error handling, traps, argument parsing',
          'Automates complex workflows; writes portable, testable scripts',
          'Defines team scripting conventions; authors shared CI/tooling scripts',
        ),
      },
      {
        id: 'git-branching',
        label: 'Git & Branching Strategies',
        categoryId: 'core-engineering',
        descriptors: descriptors(
          'Never used Git',
          'Can clone, commit, push on a single branch',
          'Uses feature branches; needs help resolving merge conflicts',
          'Rebases, cherry-picks, uses conventional commits confidently',
          'Designs branching strategies; handles complex history rewrites',
          'Defines team Git workflow; administers hooks, merge policies',
        ),
      },
      {
        id: 'patterns-solid',
        label: 'Patterns (SOLID, Clean Code)',
        categoryId: 'core-engineering',
        descriptors: descriptors(
          'Not familiar with design patterns or SOLID',
          'Can name SOLID principles; has read Clean Code',
          'Applies SRP and DI with guidance; recognizes code smells',
          'Applies patterns naturally; refactors toward clean architecture',
          'Mentors on pattern selection; leads refactoring initiatives',
          'Defines team coding standards; arbitrates architectural patterns',
        ),
      },
    ],
  },

  // ─── 2. Backend & Integration Services ─────────────────
  {
    id: 'backend-integration',
    label: 'Backend & Integration Services',
    emoji: '\u2699\uFE0F',
    skills: [
      {
        id: 'spring-boot',
        label: 'Spring Boot (REST, Validation, Scheduling)',
        categoryId: 'backend-integration',
        descriptors: descriptors(
          'Never used Spring Boot',
          'Understands auto-configuration concept; can read a controller',
          'Creates REST endpoints with help; uses basic validation annotations',
          'Builds complete APIs with error handling, scheduling, profiles',
          'Designs custom starters; masters actuator, conditional beans',
          'Defines team Spring Boot standards; leads framework upgrades',
        ),
      },
      {
        id: 'jpa-hibernate',
        label: 'JPA / Hibernate',
        categoryId: 'backend-integration',
        descriptors: descriptors(
          'Never used JPA or Hibernate',
          'Knows ORM concept; can read entity annotations',
          'Maps entities with help; needs guidance on fetch strategies',
          'Manages lazy loading, N+1, migrations; writes JPQL/Criteria',
          'Tunes second-level cache; designs multi-tenant persistence',
          'Defines team JPA conventions; solves complex mapping edge cases',
        ),
      },
      {
        id: 'ddd',
        label: 'Domain-driven Design (DDD)',
        categoryId: 'backend-integration',
        descriptors: descriptors(
          'Not familiar with DDD concepts',
          'Knows aggregates, bounded contexts as vocabulary',
          'Can identify entities vs value objects with help',
          'Models bounded contexts; implements aggregates and domain events',
          'Leads context mapping across services; designs anti-corruption layers',
          'Defines team DDD practices; facilitates Event Storming sessions',
        ),
      },
      {
        id: 'api-design',
        label: 'API Design (REST, versioning, OpenAPI)',
        categoryId: 'backend-integration',
        descriptors: descriptors(
          'Never designed a REST API',
          'Knows HTTP methods, status codes, REST basics',
          'Designs simple CRUD endpoints; needs help with versioning',
          'Writes OpenAPI specs; implements pagination, HATEOAS, versioning',
          'Designs cross-service API contracts; defines naming conventions',
          'Owns team API design guide; reviews all public API contracts',
        ),
      },
      {
        id: 'messaging',
        label: 'Messaging (Kafka / Redpanda, RabbitMQ)',
        categoryId: 'backend-integration',
        descriptors: descriptors(
          'Never worked with message brokers',
          'Understands pub/sub and queue concepts',
          'Produces/consumes messages with help; basic topic setup',
          'Handles partitioning, consumer groups, dead-letter topics',
          'Designs event-driven architectures; tunes throughput and retention',
          'Defines team messaging standards; handles schema evolution at scale',
        ),
      },
      {
        id: 'bpm-orchestration',
        label: 'BPM / Orchestration (Camunda, Temporal, Kestra)',
        categoryId: 'backend-integration',
        descriptors: descriptors(
          'Never used workflow/orchestration engines',
          'Understands BPMN concepts or workflow-as-code idea',
          'Models simple workflows; deploys with help',
          'Implements multi-step processes with error handling, compensation',
          'Designs long-running sagas; integrates orchestration across services',
          'Defines team orchestration patterns; evaluates engine trade-offs',
        ),
      },
      {
        id: 'postgresql',
        label: 'PostgreSQL (CloudNativePG)',
        categoryId: 'backend-integration',
        descriptors: descriptors(
          'Never administered PostgreSQL',
          'Knows PostgreSQL differs from MySQL; basic psql usage',
          'Creates tables, indexes; needs help with CNPG operator config',
          'Manages CNPG clusters, backups, connection pooling (PgBouncer)',
          'Tunes pg settings for workloads; handles failover, replication',
          'Defines team PostgreSQL standards; architects HA topologies',
        ),
      },
      {
        id: 'redis-dragonfly',
        label: 'Redis / Dragonfly',
        categoryId: 'backend-integration',
        descriptors: descriptors(
          'Never used Redis or Dragonfly',
          'Knows Redis is an in-memory key-value store',
          'Uses basic GET/SET, TTL; needs help with data structures',
          'Implements caching strategies, pub/sub, sorted sets in production',
          'Designs eviction policies; manages Sentinel/cluster topologies',
          'Defines team caching architecture; benchmarks Redis vs Dragonfly',
        ),
      },
    ],
  },

  // ─── 3. Frontend & UI Engineering ──────────────────────
  {
    id: 'frontend-ui',
    label: 'Frontend & UI Engineering',
    emoji: '\uD83C\uDFA8',
    skills: [
      {
        id: 'angular',
        label: 'Angular',
        categoryId: 'frontend-ui',
        descriptors: descriptors(
          'Never used Angular',
          'Knows Angular is component-based; can read templates',
          'Creates components, uses routing with help; knows module basics',
          'Builds feature modules; uses signals, lazy loading, interceptors',
          'Designs shared libraries; optimizes change detection, bundle size',
          'Defines team Angular architecture; leads major version migrations',
        ),
      },
      {
        id: 'rxjs',
        label: 'RxJS (real mastery)',
        categoryId: 'frontend-ui',
        descriptors: descriptors(
          'Never used RxJS',
          'Knows Observable concept; uses basic .subscribe()',
          'Uses map, filter, switchMap with help; struggles with memory leaks',
          'Chains operators fluently; manages subscriptions, handles errors',
          'Designs custom operators; masters higher-order observables, schedulers',
          'Defines team reactive patterns; solves complex race conditions',
        ),
      },
      {
        id: 'html-css-scss',
        label: 'HTML / CSS / SCSS',
        categoryId: 'frontend-ui',
        descriptors: descriptors(
          'No HTML/CSS experience',
          'Understands tags, selectors, box model at basic level',
          'Builds simple layouts; needs help with Flexbox, Grid, SCSS nesting',
          'Creates responsive layouts; uses SCSS variables, mixins, BEM naming',
          'Designs theme systems; masters CSS custom properties, animations',
          'Defines team SCSS architecture; ensures cross-browser consistency',
        ),
      },
      {
        id: 'state-management',
        label: 'State Management (NgRx or equivalent)',
        categoryId: 'frontend-ui',
        descriptors: descriptors(
          'Never used frontend state management libraries',
          'Knows Redux pattern concepts (store, actions, reducers)',
          'Creates basic store slices with help; struggles with effects',
          'Implements feature stores, effects, selectors with memoization',
          'Designs normalized state shape; uses entity adapters, router store',
          'Defines team state management patterns; evaluates signal-based alternatives',
        ),
      },
      {
        id: 'component-libraries',
        label: 'Component Libraries (PrimeNG, AG Grid)',
        categoryId: 'frontend-ui',
        descriptors: descriptors(
          'Never used PrimeNG or AG Grid',
          'Knows these are UI component libraries for Angular',
          'Uses basic components (table, dialog) with help from docs',
          'Customizes themes, templates; configures AG Grid column defs',
          'Builds reusable wrappers; handles virtual scroll, server-side row models',
          'Defines team component usage standards; contributes custom components',
        ),
      },
      {
        id: 'accessibility-design-system',
        label: 'Accessibility & Design System',
        categoryId: 'frontend-ui',
        descriptors: descriptors(
          'No knowledge of accessibility or design systems',
          'Knows WCAG exists; understands semantic HTML matters',
          'Adds aria labels, alt text with help; follows existing design tokens',
          'Implements WCAG 2.1 AA; uses design tokens, spacing scales consistently',
          'Audits and remediates accessibility issues; extends the design system',
          'Defines team a11y standards; architects the SINAPSE design system',
        ),
      },
    ],
  },

  // ─── 4. Platform Engineering ───────────────────────────
  {
    id: 'platform-engineering',
    label: 'Platform Engineering',
    emoji: '\u2601\uFE0F',
    skills: [
      {
        id: 'gitlab-ci',
        label: 'GitLab CI',
        categoryId: 'platform-engineering',
        descriptors: descriptors(
          'Never configured GitLab CI',
          'Knows .gitlab-ci.yml triggers pipelines',
          'Writes simple jobs with help; uses predefined stages',
          'Builds multi-stage pipelines with rules, caching, artifacts',
          'Designs reusable CI templates; manages runners, DAG pipelines',
          'Defines team CI/CD standards; architects shared pipeline libraries',
        ),
      },
      {
        id: 'docker-podman',
        label: 'Docker / Podman',
        categoryId: 'platform-engineering',
        descriptors: descriptors(
          'Never built or run containers',
          'Can docker run a pre-built image',
          'Writes basic Dockerfiles; needs help with multi-stage builds',
          'Builds optimized multi-stage images; uses compose, layer caching',
          'Designs base image strategy; masters rootless, build contexts',
          'Defines team container standards; architects image supply chain',
        ),
      },
      {
        id: 'kubernetes',
        label: 'Kubernetes (RKE2 / EKS)',
        categoryId: 'platform-engineering',
        descriptors: descriptors(
          'Never used Kubernetes',
          'Knows pods, services, deployments as concepts',
          'Applies YAML manifests with help; uses kubectl for debugging',
          'Manages deployments, HPA, ingress, resource limits in production',
          'Designs namespace strategies; handles RBAC, network policies, CRDs',
          'Defines team K8s standards; architects multi-cluster RKE2/EKS topologies',
        ),
      },
      {
        id: 'helm-kustomize',
        label: 'Helm / Kustomize',
        categoryId: 'platform-engineering',
        descriptors: descriptors(
          'Never used Helm or Kustomize',
          'Knows Helm uses charts with values files',
          'Installs charts with overrides; needs help writing templates',
          'Creates custom charts with helpers, conditionals, dependencies',
          'Designs chart libraries; manages Helmfile-based multi-env releases',
          'Defines team Helm standards; architects chart promotion strategies',
        ),
      },
      {
        id: 'terraform-opentofu',
        label: 'Terraform / OpenTofu',
        categoryId: 'platform-engineering',
        descriptors: descriptors(
          'Never used Terraform or OpenTofu',
          'Knows IaC concept; understands plan/apply cycle',
          'Writes simple resources with help; understands state basics',
          'Creates modules, manages remote state, uses workspaces',
          'Designs reusable module libraries; handles state migrations, imports',
          'Defines team IaC standards; architects multi-account provisioning',
        ),
      },
      {
        id: 'ansible',
        label: 'Ansible',
        categoryId: 'platform-engineering',
        descriptors: descriptors(
          'Never used Ansible',
          'Knows Ansible automates server configuration via YAML',
          'Runs existing playbooks; edits tasks with help',
          'Writes roles, uses variables, handlers, templates (Jinja2)',
          'Designs role collections; manages inventory, Vault integration',
          'Defines team Ansible standards; architects server provisioning strategy',
        ),
      },
      {
        id: 'artifact-registries',
        label: 'Artifact Registries (Harbor / Nexus)',
        categoryId: 'platform-engineering',
        descriptors: descriptors(
          'Never managed artifact registries',
          'Knows registries store Docker images and packages',
          'Pushes/pulls images; needs help with project and access config',
          'Configures replication, retention policies, vulnerability scanning',
          'Designs multi-registry strategy; integrates with CI/CD signing',
          'Defines team registry standards; architects image promotion pipelines',
        ),
      },
    ],
  },

  // ─── 5. Observability & Reliability ────────────────────
  {
    id: 'observability-reliability',
    label: 'Observability & Reliability',
    emoji: '\uD83D\uDD2D',
    skills: [
      {
        id: 'prometheus',
        label: 'Prometheus (metrics)',
        categoryId: 'observability-reliability',
        descriptors: descriptors(
          'Never used Prometheus',
          'Knows Prometheus scrapes metrics endpoints',
          'Queries basic metrics in Grafana; needs help writing PromQL',
          'Writes PromQL queries, recording rules; instruments custom metrics',
          'Designs metric naming conventions; tunes cardinality and retention',
          'Defines team metrics standards; architects federation/Thanos setup',
        ),
      },
      {
        id: 'grafana',
        label: 'Grafana (dashboards)',
        categoryId: 'observability-reliability',
        descriptors: descriptors(
          'Never used Grafana',
          'Can view existing dashboards and read graphs',
          'Creates simple panels with help; uses template variables',
          'Builds service dashboards with alerts, annotations, drill-downs',
          'Designs dashboard-as-code (Grafonnet/JSON); manages provisioning',
          'Defines team dashboard standards; architects multi-datasource layouts',
        ),
      },
      {
        id: 'loki-elasticsearch',
        label: 'Loki / Elasticsearch (logs)',
        categoryId: 'observability-reliability',
        descriptors: descriptors(
          'Never queried centralized logs',
          'Knows logs are aggregated centrally; can view in Grafana',
          'Writes basic LogQL/KQL filters; needs help with label selectors',
          'Builds log queries with parsers, aggregations; correlates with traces',
          'Designs log pipelines; tunes retention, index lifecycle policies',
          'Defines team logging standards; architects multi-tenant log aggregation',
        ),
      },
      {
        id: 'tempo-opentelemetry',
        label: 'Tempo / OpenTelemetry (traces)',
        categoryId: 'observability-reliability',
        descriptors: descriptors(
          'Never worked with distributed tracing',
          'Knows traces connect requests across services',
          'Reads trace waterfalls in Grafana; needs help with SDK setup',
          'Instruments services with OTel SDK; configures samplers, exporters',
          'Designs trace propagation across async/messaging boundaries',
          'Defines team tracing standards; architects OTel Collector pipelines',
        ),
      },
      {
        id: 'sentry',
        label: 'Sentry (application errors)',
        categoryId: 'observability-reliability',
        descriptors: descriptors(
          'Never used Sentry',
          'Knows Sentry captures frontend/backend exceptions',
          'Reads Sentry issues; needs help configuring SDK and source maps',
          'Configures Sentry SDK, breadcrumbs, release tracking in CI',
          'Designs alert rules, ownership rules; integrates with GitLab issues',
          'Defines team error tracking standards; manages self-hosted Sentry',
        ),
      },
      {
        id: 'slo-sla-alerting',
        label: 'SLO / SLA / Alerting',
        categoryId: 'observability-reliability',
        descriptors: descriptors(
          'Not familiar with SLO/SLA concepts',
          'Knows SLOs define reliability targets',
          'Understands error budgets; needs help defining SLIs and thresholds',
          'Defines SLOs for services; configures multi-window burn-rate alerts',
          'Designs SLO frameworks across services; manages error budget policies',
          'Defines team SLO culture; leads reliability reviews and postmortems',
        ),
      },
      {
        id: 'capacity-resilience',
        label: 'Capacity Planning & Resilience Patterns',
        categoryId: 'observability-reliability',
        descriptors: descriptors(
          'No experience with capacity planning or resilience',
          'Knows about circuit breakers, retries, bulkheads as concepts',
          'Configures basic resource requests/limits; uses Resilience4j with help',
          'Right-sizes services; implements circuit breakers, rate limiting',
          'Designs capacity models; runs chaos experiments, load tests',
          'Defines team resilience standards; architects platform-wide capacity strategy',
        ),
      },
    ],
  },

  // ─── 6. Security & Compliance ──────────────────────────
  {
    id: 'security-compliance',
    label: 'Security & Compliance',
    emoji: '\uD83D\uDD12',
    skills: [
      {
        id: 'iam-keycloak',
        label: 'IAM (Keycloak, OAuth2 / OIDC)',
        categoryId: 'security-compliance',
        descriptors: descriptors(
          'Never worked with IAM or OAuth2',
          'Knows OAuth2 flows and JWT token concept',
          'Integrates Spring Security with Keycloak with help',
          'Configures realms, clients, mappers; implements RBAC in services',
          'Designs multi-realm federation; customizes Keycloak SPIs/themes',
          'Defines team IAM architecture; handles IdP brokering, fine-grained auth',
        ),
      },
      {
        id: 'secret-management',
        label: 'Secret Management (Vault)',
        categoryId: 'security-compliance',
        descriptors: descriptors(
          'Never used Vault or secret management tools',
          'Knows secrets should not live in code or environment variables',
          'Reads secrets from Vault with help; understands KV engine basics',
          'Configures AppRole, K8s auth; manages dynamic database credentials',
          'Designs secret rotation policies; integrates Vault Agent/CSI driver',
          'Defines team secret management standards; architects Vault HA setup',
        ),
      },
      {
        id: 'supply-chain',
        label: 'Supply Chain (Trivy, Snyk, Dependency-Track)',
        categoryId: 'security-compliance',
        descriptors: descriptors(
          'No experience with software supply chain security',
          'Knows CVEs exist and dependencies can be vulnerable',
          'Reads Trivy/Snyk scan reports; needs help triaging findings',
          'Configures CI scanning; triages CVEs, manages SBOM with Dependency-Track',
          'Designs supply chain gates; defines policies for blocking deployments',
          'Defines team supply chain strategy; architects end-to-end SBOM lifecycle',
        ),
      },
      {
        id: 'code-security',
        label: 'Code Security (Gitleaks, CI scanning)',
        categoryId: 'security-compliance',
        descriptors: descriptors(
          'Never used SAST/secret scanning tools',
          'Knows leaked secrets are a critical risk',
          'Reads Gitleaks reports; needs help writing allowlist rules',
          'Configures Gitleaks, SAST in CI; remediates detected secrets',
          'Designs pre-commit and CI scanning pipelines; custom rule sets',
          'Defines team code security standards; automates remediation workflows',
        ),
      },
      {
        id: 'mfa-yubikey',
        label: 'MFA / YubiKey',
        categoryId: 'security-compliance',
        descriptors: descriptors(
          'No experience with MFA hardware tokens',
          'Knows MFA adds a second authentication factor',
          'Uses YubiKey for login; needs help with initial setup',
          'Configures FIDO2/WebAuthn for services; manages key enrollment',
          'Designs MFA policies across Keycloak, GitLab, VPN',
          'Defines team MFA strategy; architects passwordless authentication',
        ),
      },
      {
        id: 'encryption-tls',
        label: 'Encryption (TLS, key rotation)',
        categoryId: 'security-compliance',
        descriptors: descriptors(
          'No experience with encryption or certificate management',
          'Knows TLS encrypts traffic; understands certificate basics',
          'Configures TLS in Spring Boot with help; uses cert-manager basics',
          'Manages cert-manager issuers; implements mTLS, key rotation',
          'Designs PKI strategy; automates certificate lifecycle across clusters',
          'Defines team encryption standards; architects zero-trust TLS mesh',
        ),
      },
      {
        id: 'threat-modeling',
        label: 'Threat Modeling & API Security',
        categoryId: 'security-compliance',
        descriptors: descriptors(
          'No experience with threat modeling',
          'Knows OWASP Top 10 risks exist',
          'Participates in threat modeling sessions; uses STRIDE with help',
          'Leads STRIDE analysis; implements API rate limiting, input validation',
          'Designs threat models for new services; runs penetration test scoping',
          'Defines team security review process; architects API gateway security',
        ),
      },
    ],
  },

  // ─── 7. Architecture, Governance & Delivery ────────────
  {
    id: 'architecture-governance',
    label: 'Architecture, Governance & Delivery',
    emoji: '\uD83C\uDFDB\uFE0F',
    skills: [
      {
        id: 'c4-structurizr',
        label: 'Architecture C4 (Structurizr)',
        categoryId: 'architecture-governance',
        descriptors: descriptors(
          'Never used C4 model or Structurizr',
          'Knows C4 has context, container, component, code levels',
          'Reads C4 diagrams; writes basic Structurizr DSL with help',
          'Maintains workspace DSL; creates diagrams for new services',
          'Designs multi-workspace strategy; automates diagram generation in CI',
          'Defines team C4 standards; owns the SINAPSE architecture model',
        ),
      },
      {
        id: 'adrs',
        label: 'ADRs (technical decision making)',
        categoryId: 'architecture-governance',
        descriptors: descriptors(
          'Not familiar with Architecture Decision Records',
          'Knows ADRs document technical decisions with context',
          'Writes ADRs with help; follows existing template',
          'Authors well-structured ADRs with trade-offs and consequences',
          'Facilitates ADR reviews; links decisions to C4 and roadmap',
          'Defines team ADR process; maintains decision log governance',
        ),
      },
      {
        id: 'archimate',
        label: 'ArchiMate (Archi)',
        categoryId: 'architecture-governance',
        descriptors: descriptors(
          'Never used ArchiMate or Archi tool',
          'Knows ArchiMate models enterprise architecture layers',
          'Reads ArchiMate diagrams; creates simple views with help',
          'Models business, application, technology layers for SINAPSE',
          'Designs viewpoints for stakeholders; links to C4 and ADRs',
          'Defines team ArchiMate standards; owns enterprise architecture repository',
        ),
      },
      {
        id: 'technical-documentation',
        label: 'Technical Documentation (OpenAPI, specs)',
        categoryId: 'architecture-governance',
        descriptors: descriptors(
          'No experience with technical spec writing',
          'Knows documentation is important; can read OpenAPI specs',
          'Writes basic specs and OpenAPI annotations with help',
          'Produces clear specs, sequence diagrams, runbooks for services',
          'Designs documentation templates; reviews specs for completeness',
          'Defines team documentation standards; architects docs-as-code pipeline',
        ),
      },
      {
        id: 'agile-scrum',
        label: 'Agile / Scrum',
        categoryId: 'architecture-governance',
        descriptors: descriptors(
          'No experience with Agile or Scrum',
          'Knows sprints, standups, retrospectives as ceremonies',
          'Participates in ceremonies; writes user stories with help',
          'Refines backlog, estimates stories, facilitates retrospectives',
          'Coaches team practices; adapts process to team maturity',
          'Defines team Agile practices; drives continuous improvement culture',
        ),
      },
      {
        id: 'code-review',
        label: 'Code Review',
        categoryId: 'architecture-governance',
        descriptors: descriptors(
          'Never done a code review',
          'Knows code review improves quality; can approve simple MRs',
          'Reviews with a checklist; catches obvious issues',
          'Gives constructive feedback on design, naming, test coverage',
          'Reviews architecture-level concerns; mentors junior reviewers',
          'Defines team review guidelines; shapes merge request standards',
        ),
      },
      {
        id: 'modular-microservices',
        label: 'Modular / Microservices / Hexagonal Design',
        categoryId: 'architecture-governance',
        descriptors: descriptors(
          'No experience with modular architecture styles',
          'Knows hexagonal architecture separates ports and adapters',
          'Follows existing module structure; needs help with boundaries',
          'Designs services with hexagonal layers; defines module APIs',
          'Decomposes monoliths; designs inter-service communication patterns',
          'Defines team architecture style; arbitrates service boundary decisions',
        ),
      },
      {
        id: 'api-governance',
        label: 'API Governance',
        categoryId: 'architecture-governance',
        descriptors: descriptors(
          'No experience with API governance',
          'Knows APIs should be consistent and versioned',
          'Follows existing API guidelines; needs help with contract reviews',
          'Enforces naming, pagination, error standards in reviews',
          'Designs linting rules (Spectral); manages API catalog/portal',
          'Defines team API governance framework; owns API design authority',
        ),
      },
      {
        id: 'data-modeling',
        label: 'Data Modeling (canonical models, DDD aggregates)',
        categoryId: 'architecture-governance',
        descriptors: descriptors(
          'No experience with data modeling or canonical models',
          'Knows entities, relationships, normalization basics',
          'Models simple schemas; needs help with aggregate boundaries',
          'Designs aggregates, canonical events; manages schema evolution',
          'Defines shared canonical models across bounded contexts',
          'Defines team data modeling standards; architects enterprise data model',
        ),
      },
    ],
  },

  // ─── 8. Soft Skills & Collaboration ────────────────────
  {
    id: 'soft-skills',
    label: 'Soft Skills & Collaboration',
    emoji: '\uD83E\uDD1D',
    skills: [
      {
        id: 'technical-writing',
        label: 'Technical Writing (specs, ADRs, runbooks)',
        categoryId: 'soft-skills',
        descriptors: descriptors(
          'Never written technical documentation',
          'Can read specs and runbooks; understands their purpose',
          'Writes drafts with heavy review; follows existing templates',
          'Produces clear specs, ADRs, and runbooks independently',
          'Designs documentation templates; coaches others on writing',
          'Defines team writing standards; establishes docs-as-code culture',
        ),
      },
      {
        id: 'mentoring',
        label: 'Mentoring & Knowledge Transfer',
        categoryId: 'soft-skills',
        descriptors: descriptors(
          'No experience mentoring or onboarding others',
          'Understands mentoring is valuable; answers questions when asked',
          'Pairs with juniors occasionally; shares knowledge informally',
          'Runs onboarding sessions; provides structured feedback regularly',
          'Designs learning paths; creates internal training materials',
          'Defines team knowledge-sharing culture; mentors mentors',
        ),
      },
      {
        id: 'cross-team-communication',
        label: 'Cross-team Communication',
        categoryId: 'soft-skills',
        descriptors: descriptors(
          'No experience working across team boundaries',
          'Knows other teams exist; attends cross-team meetings passively',
          'Relays information between teams with guidance on messaging',
          'Coordinates dependencies with other teams; communicates trade-offs clearly',
          'Facilitates cross-team alignment sessions; resolves inter-team conflicts',
          'Defines inter-team communication protocols; bridges technical and business',
        ),
      },
      {
        id: 'problem-solving-debugging',
        label: 'Problem-solving & Debugging Methodology',
        categoryId: 'soft-skills',
        descriptors: descriptors(
          'No structured approach to debugging',
          'Uses print/log debugging; knows breakpoints exist',
          'Follows debugging checklists; needs help isolating root causes',
          'Systematically isolates issues using logs, traces, and profilers',
          'Debugs complex distributed issues; teaches debugging methodology',
          'Defines team debugging playbooks; resolves the hardest production issues',
        ),
      },
      {
        id: 'incident-response',
        label: 'Incident Response & Postmortem',
        categoryId: 'soft-skills',
        descriptors: descriptors(
          'Never participated in incident response',
          'Knows incident severity levels and escalation paths exist',
          'Participates in incidents; follows runbooks with guidance',
          'Leads incident resolution; writes blameless postmortems',
          'Designs incident response processes; identifies systemic patterns',
          'Defines team incident culture; drives organization-wide reliability improvements',
        ),
      },
      {
        id: 'stakeholder-communication',
        label: 'Stakeholder Communication',
        categoryId: 'soft-skills',
        descriptors: descriptors(
          'No experience presenting to non-technical stakeholders',
          'Understands stakeholders need simplified technical explanations',
          'Prepares status updates with help; participates in demos',
          'Presents progress and trade-offs to stakeholders confidently',
          'Manages expectations proactively; translates business needs to tech plans',
          'Defines team communication cadence; trusted advisor to leadership',
        ),
      },
    ],
  },

  // ─── 9. Domain Knowledge (CAFAT / SINAPSE) ─────────────
  {
    id: 'domain-knowledge',
    label: 'Domain Knowledge (CAFAT / SINAPSE)',
    emoji: '\uD83C\uDFDB\uFE0F',
    skills: [
      {
        id: 'reglementation-sociale',
        label: 'R\u00e9glementation Sociale NC (cotisations, plafonds, assiettes)',
        categoryId: 'domain-knowledge',
        descriptors: descriptors(
          'No knowledge of NC social contribution rules',
          'Knows CAFAT collects social contributions in New Caledonia',
          'Understands basic contribution types; needs help with rate calculations',
          'Calculates contributions, plafonds, assiettes for standard cases',
          'Handles edge cases: multi-employers, r\u00e9gimes sp\u00e9ciaux, exon\u00e9rations',
          'Reference on NC social regulation; validates business rules in code',
        ),
      },
      {
        id: 'processus-recouvrement',
        label: 'Processus Recouvrement (SAED, strat\u00e9gies, d\u00e9bits/cr\u00e9dits)',
        categoryId: 'domain-knowledge',
        descriptors: descriptors(
          'No knowledge of CAFAT collection processes',
          'Knows CAFAT recovers unpaid contributions from employers',
          'Understands SAED basics; follows existing debit/credit workflows',
          'Models recovery strategies, payment plans, and balance adjustments',
          'Designs end-to-end recovery workflows including escalation paths',
          'Reference on recouvrement processes; defines business rules for SINAPSE',
        ),
      },
      {
        id: 'travailleurs-independants',
        label: 'Travailleurs Ind\u00e9pendants (immatriculation, radiation, r\u00e9gime)',
        categoryId: 'domain-knowledge',
        descriptors: descriptors(
          'No knowledge of independent worker processes at CAFAT',
          'Knows independents have a specific registration regime',
          'Understands registration lifecycle; needs help with edge cases',
          'Handles immatriculation, radiation, and regime changes independently',
          'Models complex cases: multi-activity, regime transitions, arrears',
          'Reference on TI processes; validates business rules and exceptions',
        ),
      },
      {
        id: 'sante-ruamm',
        label: 'Sant\u00e9 / RUAMM (ouverture de droits, prestations, contr\u00f4le)',
        categoryId: 'domain-knowledge',
        descriptors: descriptors(
          'No knowledge of RUAMM health coverage system',
          'Knows RUAMM provides universal health coverage in NC',
          'Understands rights opening basics; follows existing benefit workflows',
          'Models benefit eligibility, reimbursement rules, and control checks',
          'Handles complex cases: CMU, long-term illness, third-party claims',
          'Reference on RUAMM processes; defines health domain rules for SINAPSE',
        ),
      },
      {
        id: 'portail-pro',
        label: 'Portail Pro & T\u00e9l\u00e9-services (DSE, CES, e-Services)',
        categoryId: 'domain-knowledge',
        descriptors: descriptors(
          'No knowledge of CAFAT employer portal or e-services',
          'Knows employers declare contributions online via the portal',
          'Understands DSE and CES submission flows at a basic level',
          'Models t\u00e9l\u00e9-service workflows: declarations, payments, attestations',
          'Designs portal features integrating multiple back-office domains',
          'Reference on e-services; defines UX and business rules for Portail Pro',
        ),
      },
      {
        id: 'gue-rue',
        label: 'GUE / RUE (registre entreprises, cadre l\u00e9gal)',
        categoryId: 'domain-knowledge',
        descriptors: descriptors(
          'No knowledge of enterprise registry (GUE/RUE)',
          'Knows a central enterprise registry exists in NC',
          'Understands basic employer registration and legal structures',
          'Models enterprise lifecycle: creation, modification, cessation',
          'Handles multi-establishment structures and legal framework nuances',
          'Reference on GUE/RUE domain; defines registry rules for SINAPSE',
        ),
      },
      {
        id: 'comptabilite-paiements',
        label: 'Comptabilit\u00e9 & Paiements (mandatement, SEPA/COPS, flux bancaires)',
        categoryId: 'domain-knowledge',
        descriptors: descriptors(
          'No knowledge of CAFAT accounting and payment processes',
          'Knows CAFAT issues payments and manages accounting entries',
          'Understands mandatement basics; follows existing payment workflows',
          'Models payment orders, SEPA/COPS flows, and bank reconciliation',
          'Designs end-to-end payment pipelines with error handling and audit',
          'Reference on accounting domain; defines payment rules for SINAPSE',
        ),
      },
      {
        id: 'si-legacy',
        label: 'SI Legacy CAFAT (Visual, processus existants, migration)',
        categoryId: 'domain-knowledge',
        descriptors: descriptors(
          'No knowledge of CAFAT legacy information systems',
          'Knows legacy Visual-based systems exist and are being replaced',
          'Navigates legacy screens; understands basic existing processes',
          'Maps legacy processes to SINAPSE equivalents; plans data migration',
          'Designs migration strategies with rollback plans and data validation',
          'Reference on legacy SI; leads migration architecture and cutover planning',
        ),
      },
      {
        id: 'urbanisation-si',
        label: 'Urbanisation SI (plan d\u2019urbanisation, cartographie applicative)',
        categoryId: 'domain-knowledge',
        descriptors: descriptors(
          'No knowledge of SI urbanisation concepts',
          'Knows urbanisation maps applications to business capabilities',
          'Reads the application cartography; understands zone/block concepts',
          'Maintains urbanisation plan; positions new services in the cartography',
          'Designs inter-zone integration rules; manages technology obsolescence',
          'Defines team urbanisation standards; owns SINAPSE SI cartography',
        ),
      },
    ],
  },
]

// Flat lists for quick lookup
export const allSkills: Skill[] = skillCategories.flatMap((c) => c.skills)

export const skillById = new Map(allSkills.map((s) => [s.id, s]))

export const categoryById = new Map(skillCategories.map((c) => [c.id, c]))

export const allSkillIds: string[] = allSkills.map((s) => s.id)

export const allCategoryIds: string[] = skillCategories.map((c) => c.id)
