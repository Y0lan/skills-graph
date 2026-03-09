# Skill Descriptors: Team Skill Radar

**Phase 1 output** | **Date**: 2026-03-09

Rating scale reference displayed as a legend on the form.
Each skill has anchored level descriptions to ensure
consistent self-assessment across the team.

## Generic Scale

| Level | Label | Meaning |
|-------|-------|---------|
| 0 | Unknown | Never used / don't know it |
| 1 | Awareness | I know what it is, read about it |
| 2 | Guided | I can work on it with help |
| 3 | Autonomous | I can deliver features independently |
| 4 | Advanced | I can design solutions, mentor others |
| 5 | Expert | Team reference, defines standards |

---

## 1. Core Engineering

### Java

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | Never written Java code |
| 1 | Awareness | Understand JVM basics, can read Java code |
| 2 | Guided | Can fix bugs with help; knows collections, streams basics |
| 3 | Autonomous | Writes idiomatic Java 17+; uses records, sealed classes, Optional |
| 4 | Advanced | Designs generic libraries; masters concurrency, GC tuning |
| 5 | Expert | Defines team Java standards; leads JDK upgrade strategies |

### TypeScript

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | Never written TypeScript |
| 1 | Awareness | Knows TS adds types to JS; can read `.ts` files |
| 2 | Guided | Uses basic types, interfaces; needs help with generics |
| 3 | Autonomous | Writes strict TS; uses utility types, discriminated unions |
| 4 | Advanced | Designs shared type libraries; masters mapped/conditional types |
| 5 | Expert | Defines team tsconfig standards; architects complex type systems |

### Python (scripts / ETL / dev tools)

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | Never written Python |
| 1 | Awareness | Can read simple scripts; knows pip basics |
| 2 | Guided | Writes scripts with help; uses requests, pandas at basic level |
| 3 | Autonomous | Builds CLI tools, ETL scripts; manages virtualenvs, packaging |
| 4 | Advanced | Creates reusable internal tooling; writes robust error handling |
| 5 | Expert | Defines team Python tooling standards; architects ETL pipelines |

### SQL

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | Never written SQL queries |
| 1 | Awareness | Understands SELECT, WHERE, JOIN concepts |
| 2 | Guided | Writes basic queries; needs help with subqueries, indexes |
| 3 | Autonomous | Writes complex joins, CTEs, window functions; reads EXPLAIN plans |
| 4 | Advanced | Optimizes slow queries; designs schemas with proper normalization |
| 5 | Expert | Defines data modeling standards; masters PostgreSQL-specific SQL |

### Bash / Shell

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | Never written shell scripts |
| 1 | Awareness | Can run basic commands; understands pipes and redirects |
| 2 | Guided | Writes simple scripts; needs help with loops, conditionals |
| 3 | Autonomous | Writes robust scripts with error handling, traps, argument parsing |
| 4 | Advanced | Automates complex workflows; writes portable, testable scripts |
| 5 | Expert | Defines team scripting conventions; authors shared CI/tooling scripts |

### Git & Branching Strategies

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | Never used Git |
| 1 | Awareness | Can clone, commit, push on a single branch |
| 2 | Guided | Uses feature branches; needs help resolving merge conflicts |
| 3 | Autonomous | Rebases, cherry-picks, uses conventional commits confidently |
| 4 | Advanced | Designs branching strategies; handles complex history rewrites |
| 5 | Expert | Defines team Git workflow; administers hooks, merge policies |

### Patterns (SOLID, Clean Code)

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | Not familiar with design patterns or SOLID |
| 1 | Awareness | Can name SOLID principles; has read Clean Code |
| 2 | Guided | Applies SRP and DI with guidance; recognizes code smells |
| 3 | Autonomous | Applies patterns naturally; refactors toward clean architecture |
| 4 | Advanced | Mentors on pattern selection; leads refactoring initiatives |
| 5 | Expert | Defines team coding standards; arbitrates architectural patterns |

---

## 2. Backend & Integration Services

### Spring Boot (REST APIs, Validation, Scheduling)

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | Never used Spring Boot |
| 1 | Awareness | Understands auto-configuration concept; can read a controller |
| 2 | Guided | Creates REST endpoints with help; uses basic validation annotations |
| 3 | Autonomous | Builds complete APIs with error handling, scheduling, profiles |
| 4 | Advanced | Designs custom starters; masters actuator, conditional beans |
| 5 | Expert | Defines team Spring Boot standards; leads framework upgrades |

### JPA / Hibernate

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | Never used JPA or Hibernate |
| 1 | Awareness | Knows ORM concept; can read entity annotations |
| 2 | Guided | Maps entities with help; needs guidance on fetch strategies |
| 3 | Autonomous | Manages lazy loading, N+1, migrations; writes JPQL/Criteria |
| 4 | Advanced | Tunes second-level cache; designs multi-tenant persistence |
| 5 | Expert | Defines team JPA conventions; solves complex mapping edge cases |

### Domain-driven Design (DDD)

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | Not familiar with DDD concepts |
| 1 | Awareness | Knows aggregates, bounded contexts as vocabulary |
| 2 | Guided | Can identify entities vs value objects with help |
| 3 | Autonomous | Models bounded contexts; implements aggregates and domain events |
| 4 | Advanced | Leads context mapping across services; designs anti-corruption layers |
| 5 | Expert | Defines team DDD practices; facilitates Event Storming sessions |

### API Design (REST, versioning, OpenAPI)

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | Never designed a REST API |
| 1 | Awareness | Knows HTTP methods, status codes, REST basics |
| 2 | Guided | Designs simple CRUD endpoints; needs help with versioning |
| 3 | Autonomous | Writes OpenAPI specs; implements pagination, HATEOAS, versioning |
| 4 | Advanced | Designs cross-service API contracts; defines naming conventions |
| 5 | Expert | Owns team API design guide; reviews all public API contracts |

### Messaging (Kafka / Redpanda, RabbitMQ)

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | Never worked with message brokers |
| 1 | Awareness | Understands pub/sub and queue concepts |
| 2 | Guided | Produces/consumes messages with help; basic topic setup |
| 3 | Autonomous | Handles partitioning, consumer groups, dead-letter topics |
| 4 | Advanced | Designs event-driven architectures; tunes throughput and retention |
| 5 | Expert | Defines team messaging standards; handles schema evolution at scale |

### BPM / Orchestration (Camunda, Temporal, Kestra)

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | Never used workflow/orchestration engines |
| 1 | Awareness | Understands BPMN concepts or workflow-as-code idea |
| 2 | Guided | Models simple workflows; deploys with help |
| 3 | Autonomous | Implements multi-step processes with error handling, compensation |
| 4 | Advanced | Designs long-running sagas; integrates orchestration across services |
| 5 | Expert | Defines team orchestration patterns; evaluates engine trade-offs |

### PostgreSQL (CloudNativePG)

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | Never administered PostgreSQL |
| 1 | Awareness | Knows PostgreSQL differs from MySQL; basic psql usage |
| 2 | Guided | Creates tables, indexes; needs help with CNPG operator config |
| 3 | Autonomous | Manages CNPG clusters, backups, connection pooling (PgBouncer) |
| 4 | Advanced | Tunes pg settings for workloads; handles failover, replication |
| 5 | Expert | Defines team PostgreSQL standards; architects HA topologies |

### Redis / Dragonfly

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | Never used Redis or Dragonfly |
| 1 | Awareness | Knows Redis is an in-memory key-value store |
| 2 | Guided | Uses basic GET/SET, TTL; needs help with data structures |
| 3 | Autonomous | Implements caching strategies, pub/sub, sorted sets in production |
| 4 | Advanced | Designs eviction policies; manages Sentinel/cluster topologies |
| 5 | Expert | Defines team caching architecture; benchmarks Redis vs Dragonfly |

---

## 3. Frontend & UI Engineering

### Angular

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | Never used Angular |
| 1 | Awareness | Knows Angular is component-based; can read templates |
| 2 | Guided | Creates components, uses routing with help; knows module basics |
| 3 | Autonomous | Builds feature modules; uses signals, lazy loading, interceptors |
| 4 | Advanced | Designs shared libraries; optimizes change detection, bundle size |
| 5 | Expert | Defines team Angular architecture; leads major version migrations |

### RxJS (real mastery)

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | Never used RxJS |
| 1 | Awareness | Knows Observable concept; uses basic `.subscribe()` |
| 2 | Guided | Uses map, filter, switchMap with help; struggles with memory leaks |
| 3 | Autonomous | Chains operators fluently; manages subscriptions, handles errors |
| 4 | Advanced | Designs custom operators; masters higher-order observables, schedulers |
| 5 | Expert | Defines team reactive patterns; solves complex race conditions |

### HTML / CSS / SCSS

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | No HTML/CSS experience |
| 1 | Awareness | Understands tags, selectors, box model at basic level |
| 2 | Guided | Builds simple layouts; needs help with Flexbox, Grid, SCSS nesting |
| 3 | Autonomous | Creates responsive layouts; uses SCSS variables, mixins, BEM naming |
| 4 | Advanced | Designs theme systems; masters CSS custom properties, animations |
| 5 | Expert | Defines team SCSS architecture; ensures cross-browser consistency |

### State Management (NgRx or equivalent)

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | Never used frontend state management libraries |
| 1 | Awareness | Knows Redux pattern concepts (store, actions, reducers) |
| 2 | Guided | Creates basic store slices with help; struggles with effects |
| 3 | Autonomous | Implements feature stores, effects, selectors with memoization |
| 4 | Advanced | Designs normalized state shape; uses entity adapters, router store |
| 5 | Expert | Defines team state management patterns; evaluates signal-based alternatives |

### Component Libraries (PrimeNG, AG Grid)

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | Never used PrimeNG or AG Grid |
| 1 | Awareness | Knows these are UI component libraries for Angular |
| 2 | Guided | Uses basic components (table, dialog) with help from docs |
| 3 | Autonomous | Customizes themes, templates; configures AG Grid column defs |
| 4 | Advanced | Builds reusable wrappers; handles virtual scroll, server-side row models |
| 5 | Expert | Defines team component usage standards; contributes custom components |

### Accessibility & Design System

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | No knowledge of accessibility or design systems |
| 1 | Awareness | Knows WCAG exists; understands semantic HTML matters |
| 2 | Guided | Adds aria labels, alt text with help; follows existing design tokens |
| 3 | Autonomous | Implements WCAG 2.1 AA; uses design tokens, spacing scales consistently |
| 4 | Advanced | Audits and remediates accessibility issues; extends the design system |
| 5 | Expert | Defines team a11y standards; architects the SINAPSE design system |

---

## 4. Platform Engineering

### GitLab CI

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | Never configured GitLab CI |
| 1 | Awareness | Knows `.gitlab-ci.yml` triggers pipelines |
| 2 | Guided | Writes simple jobs with help; uses predefined stages |
| 3 | Autonomous | Builds multi-stage pipelines with rules, caching, artifacts |
| 4 | Advanced | Designs reusable CI templates; manages runners, DAG pipelines |
| 5 | Expert | Defines team CI/CD standards; architects shared pipeline libraries |

### Docker / Podman

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | Never built or run containers |
| 1 | Awareness | Can `docker run` a pre-built image |
| 2 | Guided | Writes basic Dockerfiles; needs help with multi-stage builds |
| 3 | Autonomous | Builds optimized multi-stage images; uses compose, layer caching |
| 4 | Advanced | Designs base image strategy; masters rootless, build contexts |
| 5 | Expert | Defines team container standards; architects image supply chain |

### Kubernetes (RKE2 / EKS)

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | Never used Kubernetes |
| 1 | Awareness | Knows pods, services, deployments as concepts |
| 2 | Guided | Applies YAML manifests with help; uses kubectl for debugging |
| 3 | Autonomous | Manages deployments, HPA, ingress, resource limits in production |
| 4 | Advanced | Designs namespace strategies; handles RBAC, network policies, CRDs |
| 5 | Expert | Defines team K8s standards; architects multi-cluster RKE2/EKS topologies |

### Helm / Kustomize

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | Never used Helm or Kustomize |
| 1 | Awareness | Knows Helm uses charts with values files |
| 2 | Guided | Installs charts with overrides; needs help writing templates |
| 3 | Autonomous | Creates custom charts with helpers, conditionals, dependencies |
| 4 | Advanced | Designs chart libraries; manages Helmfile-based multi-env releases |
| 5 | Expert | Defines team Helm standards; architects chart promotion strategies |

### Terraform / OpenTofu

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | Never used Terraform or OpenTofu |
| 1 | Awareness | Knows IaC concept; understands plan/apply cycle |
| 2 | Guided | Writes simple resources with help; understands state basics |
| 3 | Autonomous | Creates modules, manages remote state, uses workspaces |
| 4 | Advanced | Designs reusable module libraries; handles state migrations, imports |
| 5 | Expert | Defines team IaC standards; architects multi-account provisioning |

### Ansible

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | Never used Ansible |
| 1 | Awareness | Knows Ansible automates server configuration via YAML |
| 2 | Guided | Runs existing playbooks; edits tasks with help |
| 3 | Autonomous | Writes roles, uses variables, handlers, templates (Jinja2) |
| 4 | Advanced | Designs role collections; manages inventory, Vault integration |
| 5 | Expert | Defines team Ansible standards; architects server provisioning strategy |

### Artifact Registries (Harbor / Nexus)

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | Never managed artifact registries |
| 1 | Awareness | Knows registries store Docker images and packages |
| 2 | Guided | Pushes/pulls images; needs help with project and access config |
| 3 | Autonomous | Configures replication, retention policies, vulnerability scanning |
| 4 | Advanced | Designs multi-registry strategy; integrates with CI/CD signing |
| 5 | Expert | Defines team registry standards; architects image promotion pipelines |

---

## 5. Observability & Reliability

### Prometheus (metrics)

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | Never used Prometheus |
| 1 | Awareness | Knows Prometheus scrapes metrics endpoints |
| 2 | Guided | Queries basic metrics in Grafana; needs help writing PromQL |
| 3 | Autonomous | Writes PromQL queries, recording rules; instruments custom metrics |
| 4 | Advanced | Designs metric naming conventions; tunes cardinality and retention |
| 5 | Expert | Defines team metrics standards; architects federation/Thanos setup |

### Grafana (dashboards)

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | Never used Grafana |
| 1 | Awareness | Can view existing dashboards and read graphs |
| 2 | Guided | Creates simple panels with help; uses template variables |
| 3 | Autonomous | Builds service dashboards with alerts, annotations, drill-downs |
| 4 | Advanced | Designs dashboard-as-code (Grafonnet/JSON); manages provisioning |
| 5 | Expert | Defines team dashboard standards; architects multi-datasource layouts |

### Loki / Elasticsearch (logs)

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | Never queried centralized logs |
| 1 | Awareness | Knows logs are aggregated centrally; can view in Grafana |
| 2 | Guided | Writes basic LogQL/KQL filters; needs help with label selectors |
| 3 | Autonomous | Builds log queries with parsers, aggregations; correlates with traces |
| 4 | Advanced | Designs log pipelines; tunes retention, index lifecycle policies |
| 5 | Expert | Defines team logging standards; architects multi-tenant log aggregation |

### Tempo / OpenTelemetry (traces)

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | Never worked with distributed tracing |
| 1 | Awareness | Knows traces connect requests across services |
| 2 | Guided | Reads trace waterfalls in Grafana; needs help with SDK setup |
| 3 | Autonomous | Instruments services with OTel SDK; configures samplers, exporters |
| 4 | Advanced | Designs trace propagation across async/messaging boundaries |
| 5 | Expert | Defines team tracing standards; architects OTel Collector pipelines |

### Sentry (application errors)

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | Never used Sentry |
| 1 | Awareness | Knows Sentry captures frontend/backend exceptions |
| 2 | Guided | Reads Sentry issues; needs help configuring SDK and source maps |
| 3 | Autonomous | Configures Sentry SDK, breadcrumbs, release tracking in CI |
| 4 | Advanced | Designs alert rules, ownership rules; integrates with GitLab issues |
| 5 | Expert | Defines team error tracking standards; manages self-hosted Sentry |

### SLO / SLA / Alerting

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | Not familiar with SLO/SLA concepts |
| 1 | Awareness | Knows SLOs define reliability targets |
| 2 | Guided | Understands error budgets; needs help defining SLIs and thresholds |
| 3 | Autonomous | Defines SLOs for services; configures multi-window burn-rate alerts |
| 4 | Advanced | Designs SLO frameworks across services; manages error budget policies |
| 5 | Expert | Defines team SLO culture; leads reliability reviews and postmortems |

### Capacity Planning & Resilience Patterns

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | No experience with capacity planning or resilience |
| 1 | Awareness | Knows about circuit breakers, retries, bulkheads as concepts |
| 2 | Guided | Configures basic resource requests/limits; uses Resilience4j with help |
| 3 | Autonomous | Right-sizes services; implements circuit breakers, rate limiting |
| 4 | Advanced | Designs capacity models; runs chaos experiments, load tests |
| 5 | Expert | Defines team resilience standards; architects platform-wide capacity strategy |

---

## 6. Security & Compliance

### IAM (Keycloak, OAuth2 / OIDC)

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | Never worked with IAM or OAuth2 |
| 1 | Awareness | Knows OAuth2 flows and JWT token concept |
| 2 | Guided | Integrates Spring Security with Keycloak with help |
| 3 | Autonomous | Configures realms, clients, mappers; implements RBAC in services |
| 4 | Advanced | Designs multi-realm federation; customizes Keycloak SPIs/themes |
| 5 | Expert | Defines team IAM architecture; handles IdP brokering, fine-grained auth |

### Secret Management (Vault)

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | Never used Vault or secret management tools |
| 1 | Awareness | Knows secrets should not live in code or environment variables |
| 2 | Guided | Reads secrets from Vault with help; understands KV engine basics |
| 3 | Autonomous | Configures AppRole, K8s auth; manages dynamic database credentials |
| 4 | Advanced | Designs secret rotation policies; integrates Vault Agent/CSI driver |
| 5 | Expert | Defines team secret management standards; architects Vault HA setup |

### Supply Chain (Trivy, Snyk, Dependency-Track)

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | No experience with software supply chain security |
| 1 | Awareness | Knows CVEs exist and dependencies can be vulnerable |
| 2 | Guided | Reads Trivy/Snyk scan reports; needs help triaging findings |
| 3 | Autonomous | Configures CI scanning; triages CVEs, manages SBOM with Dependency-Track |
| 4 | Advanced | Designs supply chain gates; defines policies for blocking deployments |
| 5 | Expert | Defines team supply chain strategy; architects end-to-end SBOM lifecycle |

### Code Security (Gitleaks, CI scanning)

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | Never used SAST/secret scanning tools |
| 1 | Awareness | Knows leaked secrets are a critical risk |
| 2 | Guided | Reads Gitleaks reports; needs help writing allowlist rules |
| 3 | Autonomous | Configures Gitleaks, SAST in CI; remediates detected secrets |
| 4 | Advanced | Designs pre-commit and CI scanning pipelines; custom rule sets |
| 5 | Expert | Defines team code security standards; automates remediation workflows |

### MFA / YubiKey

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | No experience with MFA hardware tokens |
| 1 | Awareness | Knows MFA adds a second authentication factor |
| 2 | Guided | Uses YubiKey for login; needs help with initial setup |
| 3 | Autonomous | Configures FIDO2/WebAuthn for services; manages key enrollment |
| 4 | Advanced | Designs MFA policies across Keycloak, GitLab, VPN |
| 5 | Expert | Defines team MFA strategy; architects passwordless authentication |

### Encryption (TLS, key rotation)

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | No experience with encryption or certificate management |
| 1 | Awareness | Knows TLS encrypts traffic; understands certificate basics |
| 2 | Guided | Configures TLS in Spring Boot with help; uses cert-manager basics |
| 3 | Autonomous | Manages cert-manager issuers; implements mTLS, key rotation |
| 4 | Advanced | Designs PKI strategy; automates certificate lifecycle across clusters |
| 5 | Expert | Defines team encryption standards; architects zero-trust TLS mesh |

### Threat Modeling & API Security

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | No experience with threat modeling |
| 1 | Awareness | Knows OWASP Top 10 risks exist |
| 2 | Guided | Participates in threat modeling sessions; uses STRIDE with help |
| 3 | Autonomous | Leads STRIDE analysis; implements API rate limiting, input validation |
| 4 | Advanced | Designs threat models for new services; runs penetration test scoping |
| 5 | Expert | Defines team security review process; architects API gateway security |

---

## 7. Architecture, Governance & Delivery

### Architecture C4 (Structurizr)

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | Never used C4 model or Structurizr |
| 1 | Awareness | Knows C4 has context, container, component, code levels |
| 2 | Guided | Reads C4 diagrams; writes basic Structurizr DSL with help |
| 3 | Autonomous | Maintains workspace DSL; creates diagrams for new services |
| 4 | Advanced | Designs multi-workspace strategy; automates diagram generation in CI |
| 5 | Expert | Defines team C4 standards; owns the SINAPSE architecture model |

### ADRs (technical decision making)

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | Not familiar with Architecture Decision Records |
| 1 | Awareness | Knows ADRs document technical decisions with context |
| 2 | Guided | Writes ADRs with help; follows existing template |
| 3 | Autonomous | Authors well-structured ADRs with trade-offs and consequences |
| 4 | Advanced | Facilitates ADR reviews; links decisions to C4 and roadmap |
| 5 | Expert | Defines team ADR process; maintains decision log governance |

### ArchiMate (Archi)

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | Never used ArchiMate or Archi tool |
| 1 | Awareness | Knows ArchiMate models enterprise architecture layers |
| 2 | Guided | Reads ArchiMate diagrams; creates simple views with help |
| 3 | Autonomous | Models business, application, technology layers for SINAPSE |
| 4 | Advanced | Designs viewpoints for stakeholders; links to C4 and ADRs |
| 5 | Expert | Defines team ArchiMate standards; owns enterprise architecture repository |

### Technical Documentation (OpenAPI, specs)

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | No experience with technical spec writing |
| 1 | Awareness | Knows documentation is important; can read OpenAPI specs |
| 2 | Guided | Writes basic specs and OpenAPI annotations with help |
| 3 | Autonomous | Produces clear specs, sequence diagrams, runbooks for services |
| 4 | Advanced | Designs documentation templates; reviews specs for completeness |
| 5 | Expert | Defines team documentation standards; architects docs-as-code pipeline |

### Agile / Scrum

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | No experience with Agile or Scrum |
| 1 | Awareness | Knows sprints, standups, retrospectives as ceremonies |
| 2 | Guided | Participates in ceremonies; writes user stories with help |
| 3 | Autonomous | Refines backlog, estimates stories, facilitates retrospectives |
| 4 | Advanced | Coaches team practices; adapts process to team maturity |
| 5 | Expert | Defines team Agile practices; drives continuous improvement culture |

### Code Review

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | Never done a code review |
| 1 | Awareness | Knows code review improves quality; can approve simple MRs |
| 2 | Guided | Reviews with a checklist; catches obvious issues |
| 3 | Autonomous | Gives constructive feedback on design, naming, test coverage |
| 4 | Advanced | Reviews architecture-level concerns; mentors junior reviewers |
| 5 | Expert | Defines team review guidelines; shapes merge request standards |

### Modular / Microservices / Hexagonal Design

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | No experience with modular architecture styles |
| 1 | Awareness | Knows hexagonal architecture separates ports and adapters |
| 2 | Guided | Follows existing module structure; needs help with boundaries |
| 3 | Autonomous | Designs services with hexagonal layers; defines module APIs |
| 4 | Advanced | Decomposes monoliths; designs inter-service communication patterns |
| 5 | Expert | Defines team architecture style; arbitrates service boundary decisions |

### API Governance

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | No experience with API governance |
| 1 | Awareness | Knows APIs should be consistent and versioned |
| 2 | Guided | Follows existing API guidelines; needs help with contract reviews |
| 3 | Autonomous | Enforces naming, pagination, error standards in reviews |
| 4 | Advanced | Designs linting rules (Spectral); manages API catalog/portal |
| 5 | Expert | Defines team API governance framework; owns API design authority |

### Data Modeling (canonical models, DDD aggregates)

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | No experience with data modeling or canonical models |
| 1 | Awareness | Knows entities, relationships, normalization basics |
| 2 | Guided | Models simple schemas; needs help with aggregate boundaries |
| 3 | Autonomous | Designs aggregates, canonical events; manages schema evolution |
| 4 | Advanced | Defines shared canonical models across bounded contexts |
| 5 | Expert | Defines team data modeling standards; architects enterprise data model |

---

## 8. Soft Skills & Collaboration

### Technical Writing (specs, ADRs, runbooks)

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | Never written technical documentation |
| 1 | Awareness | Can read specs and runbooks; understands their purpose |
| 2 | Guided | Writes drafts with heavy review; follows existing templates |
| 3 | Autonomous | Produces clear specs, ADRs, and runbooks independently |
| 4 | Advanced | Designs documentation templates; coaches others on writing |
| 5 | Expert | Defines team writing standards; establishes docs-as-code culture |

### Mentoring & Knowledge Transfer

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | No experience mentoring or onboarding others |
| 1 | Awareness | Understands mentoring is valuable; answers questions when asked |
| 2 | Guided | Pairs with juniors occasionally; shares knowledge informally |
| 3 | Autonomous | Runs onboarding sessions; provides structured feedback regularly |
| 4 | Advanced | Designs learning paths; creates internal training materials |
| 5 | Expert | Defines team knowledge-sharing culture; mentors mentors |

### Cross-team Communication

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | No experience working across team boundaries |
| 1 | Awareness | Knows other teams exist; attends cross-team meetings passively |
| 2 | Guided | Relays information between teams with guidance on messaging |
| 3 | Autonomous | Coordinates dependencies with other teams; communicates trade-offs clearly |
| 4 | Advanced | Facilitates cross-team alignment sessions; resolves inter-team conflicts |
| 5 | Expert | Defines inter-team communication protocols; bridges technical and business |

### Problem-solving & Debugging Methodology

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | No structured approach to debugging |
| 1 | Awareness | Uses print/log debugging; knows breakpoints exist |
| 2 | Guided | Follows debugging checklists; needs help isolating root causes |
| 3 | Autonomous | Systematically isolates issues using logs, traces, and profilers |
| 4 | Advanced | Debugs complex distributed issues; teaches debugging methodology |
| 5 | Expert | Defines team debugging playbooks; resolves the hardest production issues |

### Incident Response & Postmortem

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | Never participated in incident response |
| 1 | Awareness | Knows incident severity levels and escalation paths exist |
| 2 | Guided | Participates in incidents; follows runbooks with guidance |
| 3 | Autonomous | Leads incident resolution; writes blameless postmortems |
| 4 | Advanced | Designs incident response processes; identifies systemic patterns |
| 5 | Expert | Defines team incident culture; drives organization-wide reliability improvements |

### Stakeholder Communication

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | No experience presenting to non-technical stakeholders |
| 1 | Awareness | Understands stakeholders need simplified technical explanations |
| 2 | Guided | Prepares status updates with help; participates in demos |
| 3 | Autonomous | Presents progress and trade-offs to stakeholders confidently |
| 4 | Advanced | Manages expectations proactively; translates business needs to tech plans |
| 5 | Expert | Defines team communication cadence; trusted advisor to leadership |

---

## 9. Domain Knowledge (CAFAT / SINAPSE)

### Réglementation Sociale NC (cotisations, plafonds, assiettes)

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | No knowledge of NC social contribution rules |
| 1 | Awareness | Knows CAFAT collects social contributions in New Caledonia |
| 2 | Guided | Understands basic contribution types; needs help with rate calculations |
| 3 | Autonomous | Calculates contributions, plafonds, assiettes for standard cases |
| 4 | Advanced | Handles edge cases: multi-employers, régimes spéciaux, exonérations |
| 5 | Expert | Reference on NC social regulation; validates business rules in code |

### Processus Recouvrement (SAED, stratégies, débits/crédits)

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | No knowledge of CAFAT collection processes |
| 1 | Awareness | Knows CAFAT recovers unpaid contributions from employers |
| 2 | Guided | Understands SAED basics; follows existing debit/credit workflows |
| 3 | Autonomous | Models recovery strategies, payment plans, and balance adjustments |
| 4 | Advanced | Designs end-to-end recovery workflows including escalation paths |
| 5 | Expert | Reference on recouvrement processes; defines business rules for SINAPSE |

### Travailleurs Indépendants (immatriculation, radiation, régime)

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | No knowledge of independent worker processes at CAFAT |
| 1 | Awareness | Knows independents have a specific registration regime |
| 2 | Guided | Understands registration lifecycle; needs help with edge cases |
| 3 | Autonomous | Handles immatriculation, radiation, and regime changes independently |
| 4 | Advanced | Models complex cases: multi-activity, regime transitions, arrears |
| 5 | Expert | Reference on TI processes; validates business rules and exceptions |

### Santé / RUAMM (ouverture de droits, prestations, contrôle)

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | No knowledge of RUAMM health coverage system |
| 1 | Awareness | Knows RUAMM provides universal health coverage in NC |
| 2 | Guided | Understands rights opening basics; follows existing benefit workflows |
| 3 | Autonomous | Models benefit eligibility, reimbursement rules, and control checks |
| 4 | Advanced | Handles complex cases: CMU, long-term illness, third-party claims |
| 5 | Expert | Reference on RUAMM processes; defines health domain rules for SINAPSE |

### Portail Pro & Télé-services (DSE, CES, e-Services)

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | No knowledge of CAFAT employer portal or e-services |
| 1 | Awareness | Knows employers declare contributions online via the portal |
| 2 | Guided | Understands DSE and CES submission flows at a basic level |
| 3 | Autonomous | Models télé-service workflows: declarations, payments, attestations |
| 4 | Advanced | Designs portal features integrating multiple back-office domains |
| 5 | Expert | Reference on e-services; defines UX and business rules for Portail Pro |

### GUE / RUE (registre entreprises, cadre légal)

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | No knowledge of enterprise registry (GUE/RUE) |
| 1 | Awareness | Knows a central enterprise registry exists in NC |
| 2 | Guided | Understands basic employer registration and legal structures |
| 3 | Autonomous | Models enterprise lifecycle: creation, modification, cessation |
| 4 | Advanced | Handles multi-establishment structures and legal framework nuances |
| 5 | Expert | Reference on GUE/RUE domain; defines registry rules for SINAPSE |

### Comptabilité & Paiements (mandatement, SEPA/COPS, flux bancaires)

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | No knowledge of CAFAT accounting and payment processes |
| 1 | Awareness | Knows CAFAT issues payments and manages accounting entries |
| 2 | Guided | Understands mandatement basics; follows existing payment workflows |
| 3 | Autonomous | Models payment orders, SEPA/COPS flows, and bank reconciliation |
| 4 | Advanced | Designs end-to-end payment pipelines with error handling and audit |
| 5 | Expert | Reference on accounting domain; defines payment rules for SINAPSE |

### SI Legacy CAFAT (Visual, processus existants, migration)

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | No knowledge of CAFAT legacy information systems |
| 1 | Awareness | Knows legacy Visual-based systems exist and are being replaced |
| 2 | Guided | Navigates legacy screens; understands basic existing processes |
| 3 | Autonomous | Maps legacy processes to SINAPSE equivalents; plans data migration |
| 4 | Advanced | Designs migration strategies with rollback plans and data validation |
| 5 | Expert | Reference on legacy SI; leads migration architecture and cutover planning |

### Urbanisation SI (plan d'urbanisation, cartographie applicative)

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Unknown | No knowledge of SI urbanisation concepts |
| 1 | Awareness | Knows urbanisation maps applications to business capabilities |
| 2 | Guided | Reads the application cartography; understands zone/block concepts |
| 3 | Autonomous | Maintains urbanisation plan; positions new services in the cartography |
| 4 | Advanced | Designs inter-zone integration rules; manages technology obsolescence |
| 5 | Expert | Defines team urbanisation standards; owns SINAPSE SI cartography |

---

## Calibration Prompts

> **1. Core Engineering**
> You receive a merge request with 800 lines of Java and TypeScript. The code uses advanced generics, custom RxJS operators, and complex SQL with CTEs. You need to review it for correctness, performance, and maintainability, and provide actionable feedback within half a day. How confident are you in catching subtle issues across all these technologies?

> **2. Backend & Integration Services**
> You need to design a new microservice that consumes Kafka events from the DSE pipeline, applies CAFAT contribution calculation rules, and persists results in PostgreSQL via JPA. Consider error handling, idempotency, dead-letter strategies, and schema evolution. How confident are you in delivering this autonomously?

> **3. Frontend & UI Engineering**
> A new SINAPSE screen requires a complex AG Grid table with server-side filtering, custom cell renderers, reactive form validation with RxJS, and full WCAG 2.1 AA accessibility. You must integrate it into the existing Angular module with NgRx state management. How confident are you in shipping this without senior guidance?

> **4. Platform Engineering**
> The team needs a new GitLab CI pipeline that builds a multi-stage Docker image, deploys to RKE2 via Helm, provisions a CloudNativePG database with Terraform, and configures secrets from Vault. You own the entire chain from commit to production. How confident are you in setting this up end-to-end?

> **5. Observability & Reliability**
> A critical SINAPSE service handling employer declarations is experiencing intermittent 5xx errors under load. You need to correlate Prometheus metrics, Loki logs, and Tempo traces to identify the root cause, then define an SLO with burn-rate alerts to prevent recurrence. How confident are you in leading this investigation alone?

> **6. Security & Compliance**
> You must secure a new SINAPSE API: configure Keycloak OIDC with role-based access, set up Vault for database credential rotation, add Trivy scanning to CI, and perform a STRIDE threat model before the architecture review. How confident are you in handling all these security concerns without escalation?

> **7. Architecture, Governance & Delivery**
> You are asked to write an ADR for decomposing a CAFAT legacy module into three bounded contexts, model the target state in Structurizr (C4) and ArchiMate, update the API governance catalog, and present the trade-offs to the architecture board. How confident are you in driving this end-to-end?

> **8. Soft Skills & Collaboration**
> A production incident occurs during a deployment affecting employer declarations. You need to lead the incident call, coordinate with the infrastructure and business teams, communicate status to CAFAT stakeholders in non-technical terms, and write a blameless postmortem with actionable follow-ups. How confident are you in owning this process?

> **9. Domain Knowledge (CAFAT / SINAPSE)**
> A new regulation changes contribution ceilings for independent workers and impacts RUAMM eligibility rules. You need to assess the impact across recouvrement, TI, and santé domains, update the business rules in SINAPSE, ensure the Portail Pro declarations reflect the changes, and validate against the legacy system during the transition period. How confident are you in analyzing this cross-domain impact autonomously?
