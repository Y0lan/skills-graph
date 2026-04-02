# Flux de Recrutement — GIE SINAPSE

> Document de contexte destiné à Claude Code pour l'intégration du workflow de recrutement dans le Skill Radar.
> Sources : Note de synthèse campagne avril 2026 (G. BENOIT) + 7 fiches de poste officielles + workflow opérationnel CTO.

---

## 1. Vue d'ensemble

Le GIE SINAPSE, constitué en novembre 2024 comme entité d'infogérance partagée au service de la CAFAT, recrute 7 profils techniques seniors en CDI de chantier (5 ans, jusqu'à mi/fin 2030). Ces ressources sont mises à disposition en régie, intégrées directement au sein des équipes projet de la DSI CAFAT à Nouméa.

Le workflow de recrutement actuel est semi-manuel (site Drupal sinapse.nc + email + dossiers locaux + Excel). L'objectif est d'intégrer et d'automatiser ce flux dans le Skill Radar pour centraliser le suivi, calculer automatiquement la compatibilité technique candidat/poste, et faciliter l'onboarding.

---

## 2. Les 7 postes ouverts

### Catalogue des postes

| # | Poste | Stack / Domaine | Expérience | Headcount | Cigref |
|---|---|---|---|---|---|
| 1 | Tech Lead Adélia | Adélia / RPG / IBMi (legacy) | 10 ans+ | 1 (flexible) | 3.4 + Tech Lead |
| 2 | Dev Senior Adélia | Adélia / RPG / IBMi (legacy) | 7-8 ans | Flexible | 3.4 |
| 3 | Tech Lead Java / JBoss | Java / JBoss (modernisation) | 10 ans | 1 | 3.4 + Tech Lead |
| 4 | Dev Java Senior Full Stack | Java / JBoss / Angular | 7-8 ans | 1 | 3.4 |
| 5 | Dev JBoss Senior | JBoss / ZK / JavaScript | 7-8 ans | 1 | 3.4 |
| 6 | Architecte SI Logiciel | Java — architecture transverse | 10 ans | 1 | 4.9 |
| 7 | Business Analyst | Fonctionnel / technique | 7-8 ans | 1 | 2.2/2.3/2.6 |

### Skills requis par poste (données pour le Skill Radar)

Ces données structurées sont la base du radar graph côté "poste". Chaque skill a un niveau attendu (1-5) et un statut (requis / apprécié).

#### Poste 1 — Tech Lead Adélia (RPG)

| Skill | Niveau attendu | Statut |
|---|---|---|
| Adélia / RPG (4GL) / Web Adélia | 5 | Requis |
| Intégration applicative (interfaces, flux, données) | 4 | Requis |
| Diagnostic / évolution legacy contraint | 4 | Requis |
| Leadership technique / mentorat | 4 | Requis |
| API REST | 3 | Apprécié |
| BDD relationnelles / SQL | 3 | Apprécié |
| Environnements N-tiers | 3 | Apprécié |
| Méthodes Agile (Scrum) | 3 | Apprécié |

#### Poste 2 — Dev Senior Adélia (RPG)

| Skill | Niveau attendu | Statut |
|---|---|---|
| Adélia / RPG (4GL) / Web Adélia | 5 | Requis |
| Intégration applicative (interfaces, flux, données) | 4 | Requis |
| Diagnostic / évolution legacy contraint | 4 | Requis |
| Documentation technique | 3 | Requis |
| API REST | 3 | Apprécié |
| BDD relationnelles / SQL | 3 | Apprécié |
| Environnements N-tiers | 3 | Apprécié |
| Méthodes Agile (Scrum) | 2 | Apprécié |

#### Poste 3 — Tech Lead Java / JBoss

| Skill | Niveau attendu | Statut |
|---|---|---|
| Java | 5 | Requis |
| JBoss | 4 | Requis |
| SpringBoot | 4 | Requis |
| Angular | 4 | Requis |
| PostgreSQL | 4 | Requis |
| Architectures (monolithes, microservices) | 4 | Requis |
| CI/CD (Git, Maven, Jenkins, Sonar, Docker) | 4 | Requis |
| JavaScript / TypeScript | 4 | Requis |
| Kotlin | 3 | Requis |
| Groovy | 3 | Requis |
| SQL | 4 | Requis |
| Leadership technique / mentorat | 4 | Requis |
| BPMS (Bonita, Camunda) | 3 | Apprécié |
| MOM (ActiveMQ) | 3 | Apprécié |
| API | 3 | Apprécié |
| Méthodes Agile (Scrum, Kanban) / Jira | 3 | Apprécié |
| Urbanisation (BPM/BAM, MDM, BI) | 2 | Apprécié |

#### Poste 4 — Dev Java Senior Full Stack

| Skill | Niveau attendu | Statut |
|---|---|---|
| Java | 5 | Requis |
| JavaScript / TypeScript | 4 | Requis |
| SpringBoot | 4 | Requis |
| Angular | 4 | Requis |
| PostgreSQL | 4 | Requis |
| Architectures (monolithes, microservices) | 4 | Requis |
| CI/CD (Git, Maven, Jenkins, Sonar, Docker) | 4 | Requis |
| SQL | 4 | Requis |
| JBoss / ZK | 3 | Apprécié |
| Groovy | 3 | Apprécié |
| BPMS (Bonita, Camunda) | 3 | Apprécié |
| MOM (ActiveMQ) | 2 | Apprécié |
| Méthodes Agile (Scrum, Kanban) / Jira | 3 | Apprécié |
| Urbanisation (BPM/BAM, MDM, BI) | 2 | Apprécié |

#### Poste 5 — Dev JBoss Senior

| Skill | Niveau attendu | Statut |
|---|---|---|
| JBoss / ZK | 5 | Requis |
| JavaScript | 4 | Requis |
| PostgreSQL | 4 | Requis |
| Architectures (monolithes, microservices) | 4 | Requis |
| CI/CD (Git, Maven, Jenkins, Sonar, Docker) | 4 | Requis |
| Java | 3 | Apprécié |
| Groovy | 3 | Apprécié |
| Angular | 3 | Apprécié |
| BPMS (Bonita, Camunda) | 3 | Apprécié |
| MOM (ActiveMQ) | 2 | Apprécié |
| Méthodes Agile (Scrum, Kanban) / Jira | 3 | Apprécié |
| Urbanisation (BPM/BAM, MDM, BI) | 2 | Apprécié |

#### Poste 6 — Architecte SI Logiciel

| Skill | Niveau attendu | Statut |
|---|---|---|
| Patterns d'architecture logicielle (MVC, DDD, Hexa, Clean) | 5 | Requis |
| Patterns d'architecture SI (SOA, EDA) | 5 | Requis |
| Java (background développeur obligatoire) | 4 | Requis |
| UML | 4 | Requis |
| Médiation inter-applicative | 4 | Requis |
| Architecture API, services, événements, processus | 4 | Requis |
| BPMS (Bonita, Camunda) / MOM (ActiveMQ) | 4 | Requis |
| CI/CD & industrialisation (Git, Maven, Jenkins, Docker) | 4 | Requis |
| SpringBoot | 4 | Requis |
| Angular | 3 | Requis |
| PostgreSQL / DB2 | 3 | Requis |
| TOGAF / Archimate | 3 | Apprécié |
| RPG / L4G / Adélia | 2 | Apprécié |

#### Poste 7 — Business Analyst

| Skill | Niveau attendu | Statut |
|---|---|---|
| Analyse fonctionnelle / business | 5 | Requis |
| Processus métiers et impacts SI | 5 | Requis |
| Compréhension systèmes existants complexes | 4 | Requis |
| Structuration / synthèse / vulgarisation | 4 | Requis |
| Modélisation de processus (BPMN) | 4 | Apprécié |
| Environnements SI secteur public / parapublic | 3 | Apprécié |
| Projets d'intégration / transformation progressive | 3 | Apprécié |
| Cursus informatique | 3 | Apprécié |
| Sensibilité UX parcours | 2 | Apprécié |

### Soft skills communs (tous postes)

Ces critères sont éliminatoires et prioritaires sur les hard skills (décision explicite de F. SAVALLE) :

| Priorité | Critère | Nature |
|---|---|---|
| 1 | Capacité à travailler en équipe | Éliminatoire |
| 2 | Remise en question / adaptabilité institutionnelle | Soft skill |
| 3 | Posture collaborative (individualistes / fatalistes exclus) | Soft skill |
| 4 | Engagement long terme (5 ans) + motivation impact sociétal | Motivation |
| 5 | Maturité professionnelle (7-10 ans minimum) | Hard — éliminatoire |
| 6 | Maîtrise technique stack requise | Hard — éliminatoire |

### Conditions contractuelles communes

Tous les postes : CDI de chantier SINAPSE (5 ans), statut cadre, localisation Nouméa en régie au sein des équipes CAFAT. Package attractif : billet d'avion, congés supplémentaires, compensation coût de la vie NC. Rémunération selon profil (non publiée). Freelances exclus contractuellement.

---

## 3. Pipeline de recrutement

### Acteurs

| Rôle | Personne | Périmètre |
|---|---|---|
| Pilote recrutement / décideur SINAPSE | Guillaume BENOIT (Directeur GIE SINAPSE) | Validation profils, offres, communications externes |
| Co-décideur entretiens / futur manager | Franck SAVALLE (Chef département projet SI, CAFAT) | Validation technique, intégration CAFAT |
| Cabinet 1 — bassin national A | SEYOS (Maximilien) | Chasse métropole |
| Cabinet 2 — bassin national B | Altaïde (Laure, Faustine, Sonia) | Chasse métropole |

Toute communication externe est soumise à validation préalable de G. BENOIT.

### Canaux d'acquisition

| Canal | Description | Postes ciblés |
|---|---|---|
| Cabinet SEYOS (France) | Chasse + pré-qual téléphonique + entretien visio → transmission profil | Tous sauf BA |
| Cabinet Altaïde (France) | Idem, bassin distinct, zéro chevauchement | Tous sauf BA |
| Site sinapse.nc (Drupal) | Candidature directe via formulaire | Tous (priorité BA pour le local) |
| Canal direct NC | Entretiens directs BENOIT + SAVALLE | Business Analyst en priorité |
| Réseau informel | Recommandations par WhatsApp, email, etc. | Tous |

### Étapes du pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│ CANAL CABINETS (métropole)          CANAL DIRECT (NC + site)    │
│                                                                 │
│ 1. Chasse & sourcing (cabinet)      1. Publication sinapse.nc   │
│ 2. Pré-qual téléphonique ~15min     2. Candidature formulaire   │
│ 3. Entretien visio ~45min              ou réseau informel       │
│ 4. Transmission profil à SINAPSE    3. Réception email          │
│         │                                  contact@sinapse.nc   │
│         └──────────┬───────────────────────┘                    │
│                    ▼                                            │
│    ┌───────────────────────────────┐                            │
│    │ CLASSEMENT DOSSIER LOCAL      │                            │
│    │ Dossier/nom_prenom_poste_N°   │                            │
│    │ + suivi Excel (nom, prénom,   │                            │
│    │   tel, pays, statut)          │                            │
│    └───────────────┬───────────────┘                            │
│                    ▼                                            │
│    ┌───────────────────────────────┐                            │
│    │ PRÉSÉLECTION                  │                            │
│    │ • Évaluation CV               │                            │
│    │ • Taux de compatibilité       │                            │
│    │   technique (skills candidat  │                            │
│    │   vs skills poste)            │                            │
│    │ • Mail standard → lien vers   │                            │
│    │   formulaire Skill Radar      │                            │
│    └───────────────┬───────────────┘                            │
│                    ▼                                            │
│    ┌───────────────────────────────┐                            │
│    │ ENTRETIEN 1 (BENOIT+SAVALLE)  │                            │
│    │ Systématique pour tout        │                            │
│    │ candidat retenu               │                            │
│    └───────────────┬───────────────┘                            │
│                    ▼                                            │
│    ┌───────────────────────────────┐                            │
│    │ TEST ABORRO (payant)          │                            │
│    │ Test de personnalité →        │                            │
│    │ profil de motivation          │                            │
│    │ Déclenché uniquement si       │                            │
│    │ vision d'intégration claire   │                            │
│    └───────────────┬───────────────┘                            │
│                    ▼                                            │
│    ┌───────────────────────────────┐                            │
│    │ ENTRETIEN 2 (+ 3 si besoin)   │                            │
│    └───────────────┬───────────────┘                            │
│                    ▼                                            │
│    ┌───────────────────────────────┐                            │
│    │ DÉCISION + PROPOSITION        │                            │
│    │ CONTRACTUELLE (SINAPSE)       │                            │
│    └───────────────┬───────────────┘                            │
│                    ▼                                            │
│    ┌───────────────────────────────┐                            │
│    │ EMBAUCHE                      │                            │
│    │ Cible : septembre 2026        │                            │
│    └───────────────────────────────┘                            │
└─────────────────────────────────────────────────────────────────┘
```

### Convention de nommage des dossiers candidats

```
Dossier/
  nom_prenom_poste_numero/
    cv.pdf
    lettre_motivation.pdf
    ...
```

Le `numero` correspond au numéro unique du poste via GIE > emploi_nc.

### Suivi Excel actuel

| Nom | Prénom | Téléphone | Pays | Statut |
|---|---|---|---|---|
| Dupont | Marie | +33 6 ... | France | En attente |

---

## 4. Objectif d'intégration dans le Skill Radar

### Problèmes actuels

Le workflow est fragmenté : Drupal → email contact@sinapse.nc → dossiers locaux → fichier Excel → mails manuels. Le directeur fait tout manuellement (tri, classement, envoi de mails, évaluation du taux de compatibilité). Il n'y a pas de lien direct entre la fiche de poste, les skills recherchés et le radar graph du candidat.

### Ce que le Skill Radar doit absorber

1. **Référentiel de postes** — Les 7 postes ci-dessus avec leurs skills requis pondérés (niveau 1-5, requis/apprécié). Liés au numéro emploi.nc. Ce référentiel doit être pré-chargé à partir des données de la section 2.

2. **Formulaire candidat** — Remplacer le mail standard par un lien direct vers le Skill Radar, où le candidat remplit son auto-évaluation de compétences et fournit ses infos (CV, liens GitHub/LinkedIn, lettre de motivation).

3. **Calcul automatique du taux de compatibilité** — Superposer le radar du candidat sur le radar du poste pour générer un score de matching (%). Pondérer différemment les skills requis vs appréciés.

4. **Dashboard directeur** — Vue centralisée de tous les candidats par poste avec statut pipeline, taux de compatibilité, accès aux documents, infos de contact.

5. **Onboarding simplifié** — Le candidat embauché a déjà son profil Skill Radar renseigné, ce qui alimente directement son profil collaborateur.

### Statuts du pipeline

```typescript
type CandidatureStatut =
  | "postulé"
  | "présélectionné"
  | "skill_radar_envoyé"    // mail standard avec lien formulaire
  | "skill_radar_complété"  // candidat a rempli son auto-évaluation
  | "entretien_1"           // entretien BENOIT + SAVALLE
  | "aborro"                // test de personnalité (payant)
  | "entretien_2"
  | "proposition"           // proposition contractuelle envoyée
  | "embauché"
  | "refusé"
```

### Modèle de données

```typescript
interface Poste {
  id: string;                    // numéro emploi.nc
  titre: string;                 // ex: "Tech Lead Adélia"
  domaine: string;               // ex: "Adélia / IBMi (legacy)"
  experience_min: number;        // en années (7, 8, 10...)
  headcount: number;             // nombre de postes ouverts
  headcount_flexible: boolean;   // si ajustable selon marché
  skills_requis: SkillRequis[];
  soft_skills: SoftSkill[];      // communs mais pondérables
  cigref: string;                // ex: "3.4", "4.9"
  contrat: "CDI" | "CDIC";
  statut: "ouvert" | "pourvu" | "fermé";
  date_publication: Date;
}

interface SkillRequis {
  skill_id: string;
  nom: string;                   // ex: "Java", "Adélia / RPG"
  niveau_attendu: 1 | 2 | 3 | 4 | 5;
  statut: "requis" | "apprecie";
}

interface Candidat {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  pays: string;
  cv_url?: string;
  lettre_motivation_url?: string;
  github_url?: string;
  linkedin_url?: string;
  texte_descriptif?: string;
  canal_acquisition: "cabinet_seyos" | "cabinet_altaide" | "site" | "local_nc" | "reseau";
}

interface Candidature {
  candidat_id: string;
  poste_id: string;              // numéro emploi.nc
  date_candidature: Date;
  statut: CandidatureStatut;
  skills_candidat: SkillCandidat[];   // auto-évaluation via Skill Radar
  taux_compatibilite?: number;        // calculé automatiquement (0-100%)
  aborro_resultat?: string;           // profil de motivation si test passé
  notes_directeur?: string;
  entretiens: Entretien[];
}

interface SkillCandidat {
  skill_id: string;              // même référentiel que SkillRequis
  niveau_declare: 1 | 2 | 3 | 4 | 5;
}

interface Entretien {
  date: Date;
  type: "cabinet_prequalif" | "cabinet_visio" | "entretien_1" | "entretien_2" | "entretien_3";
  participants: string[];        // ex: ["BENOIT", "SAVALLE"]
  notes?: string;
  decision: "retenu" | "refusé" | "en_attente";
}
```

### Calcul du taux de compatibilité

```
Pour chaque skill du poste :
  - Si requis : poids = 2
  - Si apprécié : poids = 1

score = Σ (min(niveau_candidat, niveau_attendu) / niveau_attendu × poids)
        / Σ poids
        × 100

Résultat : pourcentage de 0 à 100%
```

Le radar graph affiche les deux profils superposés (poste = contour cible, candidat = zone remplie) pour une comparaison visuelle immédiate.

---

## 5. Source Drupal

Le code source du site sinapse.nc est dans `sinapse-source-code.zip`. Il contient la structure du formulaire de candidature et les fiches de poste publiées. Ce zip peut être analysé pour comprendre les champs du formulaire actuel, extraire les fiches de poste, et identifier le format d'email envoyé à contact@sinapse.nc.

---

## 6. Environnement technique CAFAT (pour contexte)

Cet environnement est commun à la plupart des postes et constitue le périmètre dans lequel les candidats vont travailler :

- **Architectures** : legacy monolithe (Adélia/IBMi = ~80% du SI), monolithes de domaine, microservices
- **Langages** : RPG, L4G, Java, JBoss, JavaScript/TypeScript, Groovy, SQL, Kotlin
- **Frameworks** : Adélia, Spring Boot, Angular, ZK
- **CI/CD** : Git/Bitbucket, Maven, Jenkins, Sonar, Docker, Nexus
- **Middleware** : BPMS (Bonita, Camunda), MOM (ActiveMQ), API
- **BDD** : DB2 (legacy), PostgreSQL (cible)
- **Méthodes** : Agile (Scrum, Kanban), Jira
- **Urbanisation** : BPM/BAM, MDM, BI
