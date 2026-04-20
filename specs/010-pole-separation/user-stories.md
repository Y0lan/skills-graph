# Pole Separation — User Stories & Edge Cases

**Date:** 2026-04-10 | **Feature:** 010-pole-separation

---

## Persona 1: Newcomer joining the team

> Someone just hired (any pole) who needs to fill out their first skill evaluation.

### User Stories

| # | Story | Acceptance Criteria |
|---|-------|-------------------|
| N-1 | As a newcomer on the Java/Mod pole, I want to see only the 11 categories relevant to my job so I don't waste time on irrelevant questions | Form wizard shows only pole categories by default. No Analyse Fonctionnelle, no Legacy IBMi. |
| N-2 | As a newcomer BA, I want to see 9 categories focused on functional analysis, project management, UX, and domain knowledge | Form shows analyse-fonctionnelle, project-management-pmo, change-management-training, design-ux, data-engineering-governance, management-leadership + 3 shared |
| N-3 | As a newcomer Legacy dev, I want to see the 5+3 categories that match my IBMi/Adélia work | Form shows legacy-ibmi-adelia, core-engineering + 3 shared (archi-governance, soft-skills, domain-knowledge) |
| N-4 | As a newcomer with cross-discipline skills (e.g., BA who also codes), I want to optionally fill out categories from other poles | "Ajouter des catégories hors pôle" button appears after pole categories. Clicking it reveals all remaining categories. |
| N-5 | As a newcomer, I want my progress saved automatically so I can come back later | Autosave works on every rating change. Resuming opens at the first incomplete step. |
| N-6 | As a newcomer, I want to understand the rating scale before I start | Rating legend (0-5 with French labels) is visible on every category step. |
| N-7 | As a newcomer, I want a calibration scenario for each category so I know how to judge my level | Each category shows its scenario text (e.g., "Vous maintenez un patrimoine applicatif IBMi/Adélia...") |

### Edge Cases

| # | Case | Expected Behavior |
|---|------|-------------------|
| N-E1 | Newcomer has no `pole` assigned yet (admin forgot) | `pole: null` → form shows ALL 18 categories (no filtering). Same as current behavior for directors. |
| N-E2 | Newcomer opens form before pole_categories table is seeded | API returns empty array → no filtering applied → all categories shown. Graceful degradation. |
| N-E3 | Newcomer clicks "add extra categories", fills some, then leaves and comes back | Extra category ratings are saved via autosave. On return, wizard resumes at first incomplete step (could be an extra category). showExtraCategories resets to false but the data is preserved. |
| N-E4 | Newcomer skips all shared categories (soft-skills, domain-knowledge) | Allowed — shared categories are skippable. Only pole-primary categories are mandatory. |
| N-E5 | Newcomer submits with only pole categories rated (no extras) | Valid submission. AI profile summary generates based on available data. |
| N-E6 | Newcomer's role doesn't exist in targets.json yet | Gap/target calculations return 0. No crash. Radar chart shows actuals without target overlay. |
| N-E7 | Two newcomers join on the same day, different poles | Each sees their own pole's categories independently. No interference. |

---

## Persona 2: Director (Guillaume / Olivier)

> Evaluates new recruits before hiring decisions. Reviews the overall team skill landscape. Has `pole: null` (cross-pole visibility).

### User Stories

| # | Story | Acceptance Criteria |
|---|-------|-------------------|
| D-1 | As a director, I want to see the full team overview across all poles | Dashboard team tab defaults to "Tous les pôles" (since pole: null). Shows all members and all categories. |
| D-2 | As a director, I want to filter the team view by pole to see only Java/Mod, only BA, or only Legacy | Pole dropdown in team tab: "Tous les pôles" / "Legacy" / "Java/Mod" / "Fonctionnel". Switching reloads aggregates filtered by pole. |
| D-3 | As a director, I want to compare a BA candidate against the existing BA team average | Recruitment comparison page (report-comparison) shows candidate radar vs team averages. Already pole-aware via poste→role. |
| D-4 | As a director, I want to compare any two team members regardless of pole | Cross-pole toggle (globe icon) in personal overview comparison dropdown. When ON, shows all submitted members. |
| D-5 | As a director filling my own evaluation, I want to see all categories since I'm cross-pole | `pole: null` → form shows all 18 categories, no filtering. All are skippable. |
| D-6 | As a director, I want to see at a glance which pole each team member belongs to | Pole badge on member cards in team grid (color-coded: amber for Legacy, blue for Java/Mod, green for Fonctionnel). |
| D-7 | As a director, I want to see the recruitment pipeline filtered by pole | Pipeline page already groups by pole. Stats per pole shown in dashboard header. |
| D-8 | As a director, I want to see how a candidate compares to the existing team on the candidate's specific role categories | Report comparison page uses role_categories from the poste's role. Only relevant categories are scored for compatibility. |

### Edge Cases

| # | Case | Expected Behavior |
|---|------|-------------------|
| D-E1 | Director switches pole filter rapidly | Each switch triggers a new API call. Previous results are replaced when new data arrives. No race conditions (useCallback dependency on pole). |
| D-E2 | Director filters to "Legacy" pole but no Legacy members exist yet | Team aggregate returns teamSize: 0, submittedCount: 0. UI shows "Aucun membre n'a encore soumis" or equivalent empty state. |
| D-E3 | Director compares a BA to a Dev (cross-pole) | Comparison works. Radar chart shows all categories from both members. Categories where one member has 0 scores are visually distinguishable. AI comparison summary notes the different poles. |
| D-E4 | Director views team heatmap with pole filter active | Heatmap only shows filtered members and filtered categories. Switching to "Tous" shows the full matrix. |
| D-E5 | Director fills form, submits, then checks their own dashboard | Dashboard shows all 18 categories in personal view. Team comparison defaults to "Tous" since pole: null. |

---

## Persona 3: Manager (Pierre Rossato)

> Manages the technical team day-to-day. Reviews skill gaps, plans training. Has `pole: null` (cross-pole visibility).

### User Stories

| # | Story | Acceptance Criteria |
|---|-------|-------------------|
| M-1 | As a manager, I want to see the Java/Mod team's skill gaps at a glance | Filter team tab to "Java / Modernisation". Category summary cards show team avg vs target for each of the 11 categories. Skills gap table highlights where the team is below target. |
| M-2 | As a manager, I want to identify who on the team is strongest in a specific category | Expert finder tab. Filter by category (e.g., "Sécurité & Conformité"). Shows members ranked by their average in that category. |
| M-3 | As a manager, I want to compare the BA team's skills to the dev team's skills on shared categories | Filter to "Fonctionnel", note averages on soft-skills, domain-knowledge, architecture-governance. Switch to "Java/Mod", compare same categories. |
| M-4 | As a manager, I want to track skill progression over time for my team | Skill history chart on personal overview. Progression delta on team member cards (arrow up/down with delta value). |
| M-5 | As a manager, I want to see which new recruits are closest to being ready | Recruitment pipeline page shows candidatures by status. Compatibility scores (poste, equipe, global) rank candidates. |
| M-6 | As a manager, I want to mentor a junior dev and compare our profiles | Select the junior in the comparison dropdown (same-pole default shows them). Radar overlay shows gaps. AI comparison describes strengths/weaknesses. |
| M-7 | As a manager, I want to see freshness of evaluations (who hasn't updated recently) | Team members grid shows last activity date and freshness badge (green/yellow/red). |

### Edge Cases

| # | Case | Expected Behavior |
|---|------|-------------------|
| M-E1 | Manager filters to a pole, then opens a member's profile from that filtered view | Personal overview loads the member's full data (not filtered by pole). The comparison dropdown defaults to the member's pole, not the manager's previous filter. |
| M-E2 | Manager compares two members where one skipped a shared category | Radar chart shows 0 for the skipped category for that member. Gap table marks it differently. Comparison still works. |
| M-E3 | Manager checks the BA team but no BA has submitted evaluations yet | Team aggregate for fonctionnel pole: submittedCount = 0. UI shows empty state prompting BAs to fill their forms. |
| M-E4 | Manager wants to see the Architecte SI's categories ordered differently from a regular dev | The ArchiSI role has architecture-governance first in role_categories ordering. When a candidate applies for ArchiSI, their form starts with architecture. For existing team members, ordering follows pole categories. |

---

## Persona 4: External candidate (recruitment process)

> Someone applying for a job at SINAPSE through the recruitment pipeline. Not authenticated. Has a time-limited evaluation link.

### User Stories

| # | Story | Acceptance Criteria |
|---|-------|-------------------|
| C-1 | As a candidate for a Legacy Dev Senior position, I want to see only the skills relevant to my job | Candidate form uses role_categories from the poste's role (tech-lead-adelia or dev-senior-adelia). Shows legacy-ibmi-adelia, core-engineering, domain-knowledge, soft-skills, etc. |
| C-2 | As a candidate for a BA position, I want to see functional analysis categories | Business-analyst role categories: analyse-fonctionnelle, domain-knowledge, project-management-pmo, change-management-training, soft-skills, design-ux. |
| C-3 | As a candidate for a Java Full Stack position, I want to see the full Java/Mod tech stack | dev-java-fullstack role categories: core-engineering, backend-integration, frontend-ui, platform-engineering, architecture-governance. |
| C-4 | As a candidate, I want my CV skills to be pre-filled so I start with suggestions | If CV was uploaded, AI suggestions appear with a banner "X compétences pré-remplies depuis votre CV. Vérifiez et ajustez." |
| C-5 | As a candidate, I want to know how I compare to the job requirements | After submission, the recruitment team sees taux_compatibilite_poste (candidate vs role targets) on the candidate detail page. |
| C-6 | As a candidate, I want the form to be accessible without logging in | Evaluation link /evaluate/{candidateId} is public. No auth required. Link expires after 30 days. |
| C-7 | As a candidate, I want to understand what each level means for each skill | Skill descriptors (0-5) are shown for each skill. Calibration scenario provides context. |

### Edge Cases

| # | Case | Expected Behavior |
|---|------|-------------------|
| C-E1 | Candidate's evaluation link has expired (>30 days) | Page shows "Lien expiré" message with contact info. No form rendered. |
| C-E2 | Candidate applies for two different postes (e.g., Dev Java + ArchiSI) | Two separate candidatures. Each has its own evaluation with role-specific categories. Candidate fills two forms. |
| C-E3 | Candidate applies for Legacy Dev but has no IBMi experience | They rate legacy-ibmi-adelia skills as 0 (Inconnu). Low poste compatibility score. Director sees this clearly. |
| C-E4 | Candidate's CV extraction suggests a skill level that's wrong | Candidate can override any AI suggestion. Ratings are editable until submission. |
| C-E5 | Candidate submits partially (fills 3 of 5 categories, closes browser) | Autosave preserves progress. Candidate can return to the link and resume. Only full submission (all non-skipped categories rated) triggers AI analysis. |
| C-E6 | Candidate for ArchiSI role gets architecture-governance first | Role categories ordering puts architecture-governance first for architecte-si role. Form starts there. |
| C-E7 | Recruiter changes the candidate's role after they started filling the form | Role categories update on next form load. Already-rated skills are preserved. New categories appear as unrated. |
| C-E8 | Two candidates for the same poste submit at different times | Both are scored independently. Report comparison page shows them side-by-side with radar charts and compatibility scores. |

---

## Persona 5: Business Analyst (fonctionnel pole)

> One of the 6 BAs (Nicolas D., Nicolas E., Leila, Sonalie, Amine, Audrey) filling their evaluation and comparing with other BAs.

### User Stories

| # | Story | Acceptance Criteria |
|---|-------|-------------------|
| BA-1 | As a BA, I want to see only functional/project categories in my form | Form shows 9 categories: analyse-fonctionnelle, project-management-pmo, change-management-training, design-ux, data-engineering-governance, management-leadership, architecture-governance, soft-skills-delivery, domain-knowledge. |
| BA-2 | As a BA, I want to compare my skills with other BAs on the team | Dashboard comparison dropdown defaults to same-pole (fonctionnel) members only. Shows the other 5 BAs. |
| BA-3 | As a BA who also has dev skills, I want to optionally rate myself on technical categories | "Ajouter des catégories hors pôle" button in the form. Reveals core-engineering, backend-integration, frontend-ui, etc. All skippable. |
| BA-4 | As a BA, I want to see how my domain knowledge compares to the dev team's | Toggle cross-pole comparison (globe icon). Select a dev team member. Radar overlay shows both on shared categories (domain-knowledge, soft-skills, architecture-governance). |
| BA-5 | As a BA, I want to see the BA team average radar | Dashboard team tab filtered to "Fonctionnel". Team overview shows averages for the 9 BA categories. |
| BA-6 | As a BA, I want to see where I'm below the BA target level | Personal overview shows gaps: target for "Business Analyst" role from targets.json. Top 3 gaps highlighted. |
| BA-7 | As a BA, I want to understand what "level 3 Autonome" means specifically for requirements elicitation | Skill descriptors for each skill show level-specific French descriptions. |

### Edge Cases

| # | Case | Expected Behavior |
|---|------|-------------------|
| BA-E1 | BA fills out extra dev categories, then compares with a dev | Cross-pole comparison shows both profiles. BA's dev categories appear with their self-assessed levels. Dev's functional categories show as 0 (never rated). |
| BA-E2 | BA skips design-ux (it's a pole category) | Pole categories cannot be skipped when roleCategories is set. The skip button is hidden for pole-primary categories. BA must rate all skills in design-ux or leave them at 0. |
| BA-E3 | Only 2 out of 6 BAs have submitted | Team aggregate for fonctionnel shows submittedCount: 2. Averages are computed from those 2 only. Directors/Manager included if they also submitted (pole: null). |
| BA-E4 | BA wants to compare with the manager (Pierre, pole: null) | Manager appears in same-pole comparison list (null-pole members appear in all pole filters). BA can compare. |
| BA-E5 | BA fills extra categories, then resets their form | Reset clears ALL ratings (pole + extras). showExtraCategories resets to false. BA starts fresh with pole categories only. |
| BA-E6 | First BA to submit has no team average to compare against | Team average is 0 for all categories until a second BA submits. Radar shows only the member's line. |

---

## Persona 6: Integrator / Legacy Dev (legacy pole)

> A newly recruited Adélia/RPG developer filling out their evaluation and comparing with other legacy devs.

### User Stories

| # | Story | Acceptance Criteria |
|---|-------|-------------------|
| L-1 | As a Legacy dev, I want to see IBMi/Adélia specific questions | Form shows legacy-ibmi-adelia category with 8 skills: Adélia/RPG, Web Adélia, IBMi platform, DB2/400, CL, batch interfaces, MCO diagnostic, modernisation. |
| L-2 | As a Legacy dev, I also want to rate my SQL and Git knowledge | core-engineering is a pole category for Legacy. It contains SQL, Git, Patterns, Testing. Shown by default. |
| L-3 | As a Legacy dev, I want to compare with other Legacy devs | Comparison dropdown defaults to legacy pole members. Initially may be empty if only one Legacy dev exists. |
| L-4 | As a Legacy dev who knows Java, I want to optionally fill the Java categories | "Ajouter des catégories hors pôle" reveals backend-integration, frontend-ui, platform-engineering, etc. |
| L-5 | As a Legacy dev, I want to see how the team's domain knowledge compares to mine | domain-knowledge is shared. Team aggregate shows how devs, BAs, and legacy devs all rate on CAFAT-specific knowledge. |
| L-6 | As a Legacy dev, I want the calibration scenario to match my reality | legacy-ibmi-adelia scenario: "Vous maintenez et faites évoluer un patrimoine applicatif IBMi/Adélia..." |
| L-7 | As a Legacy dev, I want to understand what Expert (5) means for Adélia/RPG | Descriptor: "Référent Adélia/RPG de l'équipe ; définit les standards de développement ; arbitre les choix techniques entre refonte et évolution du patrimoine" |

### Edge Cases

| # | Case | Expected Behavior |
|---|------|-------------------|
| L-E1 | First Legacy dev on the team (no one to compare with) | Comparison dropdown is empty (no same-pole submitted members). Globe toggle shows all-team members for cross-pole comparison. |
| L-E2 | Legacy dev rates themselves 5/5 on all Adélia skills | Valid. High scores feed into team averages and radar. Compatibility scores for future candidates compare against this baseline. |
| L-E3 | Legacy dev skips architecture-governance (shared) | Allowed — shared categories are skippable. Skipped categories excluded from radar and averages. |
| L-E4 | Legacy dev fills Java extras and gets compared to a Java dev | Cross-pole comparison shows both radars. Legacy dev may have lower Java scores but higher legacy scores. AI comparison notes the different profiles. |
| L-E5 | Legacy dev's role not in targets.json | Target levels default to 0. No gap analysis shown. Radar has no target line. Need to add Legacy role targets. |
| L-E6 | Both Legacy postes (Tech Lead + Dev Senior) have the same candidate | Candidate has two candidatures with different role_categories. Tech Lead includes soft-skills and architecture-governance; Dev Senior does not. |

---

## Persona 7: Current Dev (java_modernisation pole)

> One of the 10 existing Java/Mod team members who already filled their evaluation. Now sees the pole-filtered view.

### User Stories

| # | Story | Acceptance Criteria |
|---|-------|-------------------|
| J-1 | As a current dev, I want my existing evaluation data preserved after the pole update | All previous ratings intact. No data loss. Form shows previously rated values. |
| J-2 | As a current dev, I want to see only Java/Mod categories when I edit my form | Form now shows 11 categories (8 primary + 3 shared). The 7 non-pole categories (analyse-fonctionnelle, etc.) are hidden by default. |
| J-3 | As a current dev who previously rated BA categories, I want that data kept | Ratings for non-pole categories are preserved in the database. They just don't appear by default. Toggling "extra categories" reveals them with existing ratings. |
| J-4 | As a current dev, I want to compare only with other devs by default | Comparison dropdown filters to java_modernisation pole members (10 people). Directors/Manager (null pole) also appear. |
| J-5 | As a current dev, I want to see where the Java/Mod team is weak | Team tab filtered to "Java / Modernisation". Skills gap table shows categories below target. Category summary cards highlight low averages. |
| J-6 | As a current dev, I want to compare myself against a BA to see how our domain knowledge differs | Toggle cross-pole (globe). Select a BA from the expanded list. Radar overlay shows both on shared categories. |
| J-7 | As a current dev, I want to see how new recruits stack up | Dashboard shows all java_modernisation members including recent hires who have submitted. Comparison available. |
| J-8 | As a current dev, I want to see the new legacy-ibmi-adelia category if I'm curious | "Ajouter des catégories hors pôle" in form reveals it. Can rate myself on Adélia skills optionally. |

### Edge Cases

| # | Case | Expected Behavior |
|---|------|-------------------|
| J-E1 | Current dev had rated all 18 categories before pole separation. Now the form only shows 11. | Existing ratings for all 18 are preserved. Form resumes at the first incomplete pole category (or review step if all 11 are complete). Extra categories accessible via toggle. |
| J-E2 | Current dev resets their form | All ratings wiped (pole + non-pole). Form restarts with only 11 pole categories. |
| J-E3 | Dev switches pole filter in team tab while chatting with AI assistant | Chat context persists. Team data refreshes with new pole filter. Chat can reference both old and new contexts. |
| J-E4 | Dev compares with someone who has pole: null (director) | Works. Director's ratings are shown on all categories they rated. Categories the director skipped show as 0. |
| J-E5 | Dev opens another dev's dashboard (not their own) | Shows that member's personal overview. Comparison dropdown still defaults to java_modernisation pole. isOwnProfile=false hides edit/reset actions. |
| J-E6 | A dev gets promoted to Architecte Technique (same pole, different role targets) | Targets change based on new role in team-roster.ts. Gap analysis shifts. Existing ratings unchanged. |
| J-E7 | 10 devs compare against team average, but the team average IS their average | Team average for java_modernisation is computed from the same 10 members. Comparing one member to team avg highlights their delta from the group mean. |

---

## Persona 8: Recruiter / Recruitment Lead (Guillaume, Pierre, Olivier, Yolan, Alexandre)

> Someone with recruitment lead access who creates candidates, manages the pipeline, and evaluates fit. Can be any pole or cross-pole.

### User Stories

| # | Story | Acceptance Criteria |
|---|-------|-------------------|
| R-1 | As a recruiter, I want to create a candidate and assign them to a specific poste | Recruit page → Create candidate with name, email, role. Role determines which categories appear in their evaluation form. |
| R-2 | As a recruiter, I want to compare all candidates for the same poste side-by-side | Report comparison page for a specific poste. Radar charts, top strengths, compatibility scores for all active candidates. |
| R-3 | As a recruiter, I want to see how a candidate compares to the existing team | taux_compatibilite_equipe score. Measures how well the candidate fills gaps in the current team's skill profile. |
| R-4 | As a recruiter, I want to see the pipeline filtered by pole | Pipeline page already groups by pole. Stats per pole (candidature count, active count). |
| R-5 | As a recruiter, I want to upload a candidate's CV and get AI skill suggestions | Upload CV → text extraction → Claude generates skill suggestions → pre-fills candidate form. |
| R-6 | As a recruiter, I want to send the evaluation link to a candidate | Copy evaluation link button. Link is /evaluate/{candidateId}, public, expires in 30 days. |
| R-7 | As a recruiter, I want to track a candidate through all 10 pipeline stages | Candidature status progression: postulé → présélectionné → skill_radar_envoyé → skill_radar_complété → entretien_1 → aboro → entretien_2 → proposition → embauché/refusé |
| R-8 | As a recruiter, I want to adjust scoring weights (poste vs equipe vs soft skills) | Scoring weights dialog in pipeline page. Default: 50% poste, 20% equipe, 30% soft. Adjustable. |
| R-9 | As a recruiter, I want to see campaign-level reporting | Campaign report page: candidatures by pole, by status, by canal (cabinet, site, direct, réseau). |

### Edge Cases

| # | Case | Expected Behavior |
|---|------|-------------------|
| R-E1 | Recruiter creates a candidate without assigning a role | roleCategories is null → candidate sees ALL categories. Compatibility scoring disabled (no role to compare against). |
| R-E2 | Recruiter changes a candidate's role after they submitted | Ratings preserved. Compatibility score recalculated against new role's categories on next view. |
| R-E3 | Recruiter adjusts scoring weights to 100% soft skills, 0% poste | Global score = soft skill score only. NaN prevention already in place (fix from commit 834eef9). |
| R-E4 | Recruiter compares candidates across different postes | Not directly supported — comparison page is per-poste. Recruiter would need to view each poste's comparison separately. |
| R-E5 | No candidates have completed their evaluation for a poste | Comparison page shows empty state. No radar charts. Pipeline shows status as skill_radar_envoyé. |

---

## Persona 9: DevOps / Infra Engineer (java_modernisation pole, but infra-heavy)

> Alan, Pierre-Mathieu — they're in the java_modernisation pole but their work focuses on platform-engineering, observability, security rather than frontend/backend.

### User Stories

| # | Story | Acceptance Criteria |
|---|-------|-------------------|
| I-1 | As a DevOps, I want platform-engineering and observability to feel like my core categories | Both are in the java_modernisation pole. They appear in the form alongside the other 9 categories. |
| I-2 | As a DevOps, I want to rate myself on infrastructure-systems-network even though it's not in my pole | "Ajouter des catégories hors pôle" reveals infrastructure-systems-network (the one unassigned category). |
| I-3 | As a DevOps, I want my targets to reflect my role, not a dev's | targets.json has separate targets for "Ingénieur DevOps" (platform-engineering: 5, frontend-ui: 1) vs "Développeur Full Stack" (platform-engineering: 2, frontend-ui: 3). Gap analysis uses the correct role. |
| I-4 | As a DevOps, I want to find other infra-skilled people on the team | Expert finder filtered by platform-engineering or observability-reliability. |

### Edge Cases

| # | Case | Expected Behavior |
|---|------|-------------------|
| I-E1 | DevOps rates frontend-ui as 0 across all skills (it's a pole category, can't skip) | Valid. Frontend-ui is in the java_modernisation pole and cannot be skipped. But the DevOps can rate everything 0 (Inconnu). Radar shows a dip. |
| I-E2 | DevOps wants infrastructure-systems-network as a pole category instead of opt-in | Requires admin to add it to the java_modernisation pole_categories mapping in DB. Data-driven, no code change. |

---

## Persona 10: QA Engineer (Bethlehem — java_modernisation pole)

> QA is in the java_modernisation pole but focuses on qa-test-engineering. Unique because she's the only person in that sub-specialty.

### User Stories

| # | Story | Acceptance Criteria |
|---|-------|-------------------|
| Q-1 | As QA, I want qa-test-engineering to be a primary category in my form | It's in the java_modernisation pole. Appears by default. |
| Q-2 | As QA, I want to see how my testing skills compare to the devs' testing knowledge | Same-pole comparison. QA rates qa-test-engineering highly. Devs may rate lower. Comparison highlights this. |
| Q-3 | As QA, I want targets that reflect a QA role, not a dev role | targets.json has "Ingénieure QA" with qa-test-engineering-appropriate targets. |

### Edge Cases

| # | Case | Expected Behavior |
|---|------|-------------------|
| Q-E1 | QA is the only person who rated qa-test-engineering highly | Team average for that category is pulled down by devs who rated 1-2. QA's personal gap shows they exceed the target. |
| Q-E2 | QA wants to compare with a future QA recruit | Candidate for a QA poste would be in java_modernisation pole. After submission, QA can compare cross-pole with them (or same-pole since both are java_mod). |

---

## Persona 11: Data Engineer (Andy — java_modernisation pole)

> Andy is in Ingénierie Technique but focuses on data. He might overlap with BA on data-engineering-governance.

### User Stories

| # | Story | Acceptance Criteria |
|---|-------|-------------------|
| DE-1 | As a data engineer, I want to rate data-engineering-governance even though it's a fonctionnel pole category | "Ajouter des catégories hors pôle" reveals data-engineering-governance. Andy can rate ETL, MDM, data quality skills. |
| DE-2 | As a data engineer, I want to compare my data skills with the BAs' data skills | Cross-pole toggle → select a BA → compare on data-engineering-governance. Both should have rated it (BA by default, Andy via opt-in). |

### Edge Cases

| # | Case | Expected Behavior |
|---|------|-------------------|
| DE-E1 | Andy rates data-engineering-governance but no BA has yet | His data scores exist but there's no fonctionnel team average to compare against. Personal radar shows his scores. |
| DE-E2 | Andy's role "Ingénieur Data" has targets that include data categories | targets.json has data-related targets. Gap analysis works. If data-engineering-governance is not in his role targets, gap defaults to 0 for that category. |

---

## Cross-Persona Edge Cases

| # | Case | Personas | Expected Behavior |
|---|------|----------|-------------------|
| X-1 | Database migration: pole_categories seed runs but categories table is empty | All | Seed is ordered: catalog first, then pole_categories. FK ensures categories exist. If catalog seed fails, pole_categories seed also fails gracefully. |
| X-2 | A new pole is needed (e.g., Infrastructure) | Admin | Add to CHECK constraint in db.ts, add to POLE_LABELS/POLE_COLORS, seed new mapping. No code changes needed for form/dashboard (data-driven). |
| X-3 | A category moves from one pole to another | Admin | Update pole_categories table. Next API call returns new mapping. Forms and dashboards update immediately. No user data migration needed. |
| X-4 | Two users from different poles view the team tab simultaneously | Director + Dev | Each gets their own pole-filtered response. No server-side state. Concurrent requests safe. |
| X-5 | API returns empty poleCategoryIds for a valid pole | All | Frontend treats it as "no filtering" (graceful degradation). All categories shown. |
| X-6 | A member's pole changes (e.g., dev transitions to BA role) | Manager | Update pole in team-roster.ts. Form now shows fonctionnel categories. Old dev ratings preserved. Comparison defaults to new pole. |
| X-7 | Candidate applies for a poste, fills form, then poste is deleted | Candidate | Candidature still exists (soft delete on poste). Evaluation data preserved. Compatibility score still viewable. |
| X-8 | Team member has ratings for skills in a category that was removed from the catalog | All | seed-catalog.ts cleans up orphaned skills/descriptors. Evaluation ratings for removed skill IDs become inert (not displayed, not counted in averages). |
| X-9 | User has very slow connection, pole-categories API times out | All | Form falls back to showing all categories (poleCategories stays null). No crash. |
| X-10 | User clears browser cache, reloads form mid-evaluation | All | Autosave has persisted progress server-side. Reload fetches latest ratings from API. Resume works. |
| X-11 | Admin adds a new skill to an existing category after people submitted | All | seed-catalog adds the skill. Existing evaluations don't have a rating for it. Category shows N-1/N rated. New skill appears unrated in the form on next edit. |
| X-12 | Admin removes a skill that people already rated | All | seed-catalog removes the skill. Existing evaluations keep the orphaned rating key in JSON (inert). Category average is recalculated without it. |
| X-13 | Someone shares a direct link to /dashboard/yolan-maldonado while logged in as someone else | All | Dashboard loads Yolan's profile. isOwnProfile=false. No edit/reset buttons shown. Comparison dropdown still works. |
| X-14 | User opens the app in two tabs, rates in tab 1, switches to tab 2 | All | Tab 2 has stale state until refresh. Autosave in tab 1 persists to server. Tab 2 refresh loads latest. No data corruption (last-write-wins). |
| X-15 | Server restarts mid-evaluation | All | SQLite WAL ensures durability. Last autosaved state is persisted. User reloads and resumes. |

---

## Exhaustive QA Test Scenarios

> These are concrete test scenarios to execute manually or automate. Organized by feature area, not persona.

### A. Form Wizard — Pole Filtering

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| F-1 | Java dev sees 11 categories | Log in as yolan-maldonado → /form/yolan-maldonado | Progress bar shows 11 steps + review. No analyse-fonctionnelle, no legacy-ibmi-adelia, no project-management-pmo, etc. |
| F-2 | BA sees 9 categories | Log in as nicolas-dufillot → /form/nicolas-dufillot | Progress bar shows 9 steps + review. No core-engineering (except shared), no backend-integration, no platform-engineering, etc. |
| F-3 | Director sees all 19 categories | Log in as guillaume-benoit → /form/guillaume-benoit | Progress bar shows 19 steps + review (18 existing + 1 new legacy). All skippable. |
| F-4 | "Add extra" toggle works | Log in as dev → form → complete all 11 pole categories → reach review → click "Ajouter des catégories hors pôle" | Progress bar expands to show all 19 categories. Extra categories appear after pole ones. Extra categories are skippable. |
| F-5 | "Add extra" toggle count is correct | Log in as dev → form → check toggle text | Should say "7 catégories supplémentaires disponibles hors de votre pôle" (19 total - 11 pole - 1 review = 7 extra) |
| F-6 | Pole category can't be skipped | Log in as BA → form → navigate to analyse-fonctionnelle | Skip button is absent. Must rate all skills or leave at 0. |
| F-7 | Extra category CAN be skipped | Log in as dev → form → add extras → navigate to analyse-fonctionnelle | Skip button present. Can skip the entire category. |
| F-8 | Resume at correct step after reload | Log in as dev → form → rate 3 categories → close browser → reopen form | Wizard resumes at category 4 (first incomplete pole category). |
| F-9 | Resume with extras previously rated | Log in as dev → form → add extras → rate 1 extra category → close → reopen | showExtraCategories resets to false. Wizard resumes at first incomplete pole category. Extra ratings preserved in DB. |
| F-10 | Candidate form uses role categories, not pole categories | Create candidate for dev-java-fullstack role → open /evaluate/{id} | Form shows role-specific categories (core-engineering, backend-integration, frontend-ui, platform-engineering, architecture-governance). NOT all 11 java_mod pole categories. |
| F-11 | Legacy candidate sees IBMi category | Create candidate for dev-senior-adelia → open /evaluate/{id} | Form shows legacy-ibmi-adelia, core-engineering, domain-knowledge. |
| F-12 | New member with pole but no saved ratings | Add new member to roster → /form/{slug} | Form starts at step 0. Shows pole categories only. No crash on empty initialData. |

### B. Dashboard — Pole Comparison

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| D-1 | Same-pole comparison default | Log in as yolan-maldonado → /dashboard/yolan-maldonado | Comparison dropdown shows only java_modernisation members + null-pole members (Pierre, Olivier, Guillaume). Does NOT show BAs. |
| D-2 | Cross-pole toggle expands list | Click globe icon | Dropdown now includes all submitted members across all poles. Globe icon changes from ghost to default variant. |
| D-3 | Cross-pole toggle back to same-pole | Click globe icon again | Dropdown filters back to same-pole. If previously selected member was cross-pole, selection resets to "Moyenne équipe". |
| D-4 | Director sees all members by default | Log in as guillaume → /dashboard/guillaume-benoit | No globe icon shown (currentMemberPole is null). Dropdown shows ALL submitted members. |
| D-5 | BA comparison with empty team | Log in as first BA (no one else submitted) → dashboard | Comparison dropdown is empty. "Moyenne équipe" shows zeros. Radar shows only personal line. |
| D-6 | Compare BA to dev on shared categories | BA → toggle cross-pole → select a dev → view radar | Radar shows both profiles. Only shared categories (soft-skills, domain-knowledge, architecture-governance) have data for both. Other categories show 0 for the member who didn't rate them. |
| D-7 | AI comparison cross-pole | BA → toggle cross-pole → select dev → click "Comparer avec l'IA" | AI generates summary noting different poles and skill profiles. Cached in comparison_summaries. |

### C. Team Tab — Pole Filter

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| T-1 | Default pole filter for dev | Log in as dev → team tab | Pole dropdown shows "Java / Modernisation" selected (member's pole). Team overview, members grid, category cards all filtered to java_modernisation. |
| T-2 | Switch to "Tous les pôles" | Change dropdown to "Tous les pôles" | Shows all 19 members. Categories include all 19. Team averages computed across everyone. |
| T-3 | Switch to "Fonctionnel" | Change dropdown | Shows only BAs + null-pole members. Categories are the 9 fonctionnel categories. |
| T-4 | Switch to "Legacy" with no members | Change dropdown to "Legacy" | teamSize shows number of null-pole members (directors/manager) who get included. If none submitted, empty state. |
| T-5 | Heatmap respects pole filter | Team tab → pole filter → Cartographie tab | Heatmap shows only filtered members and pole categories. |
| T-6 | Expert finder respects pole filter | Team tab → pole filter → Expert tab | Expert finder shows only filtered members. Category dropdown shows pole categories. |
| T-7 | Skills gap table respects pole filter | Team tab → pole filter "Fonctionnel" | Gap table shows BA categories. Dev categories absent. |
| T-8 | Director default is "Tous" | Log in as director → team tab | Dropdown defaults to "Tous les pôles" (member.pole is null). |

### D. Recruitment — Pole Awareness

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| RC-1 | Pipeline groups by pole | /recruit/pipeline | Three sections: Legacy, Java/Modernisation, Fonctionnel. Each with its postes. |
| RC-2 | Candidate compatibility uses role categories | Create candidate for BA role → candidate fills form → check scores | taux_compatibilite_poste computed only on BA role categories (analyse-fonctionnelle, domain-knowledge, etc.). Not on dev categories. |
| RC-3 | Team compatibility uses team data | Candidate submits → check taux_compatibilite_equipe | Measures how candidate fills gaps in the overall team. Uses team averages. |
| RC-4 | Comparison report for Legacy poste | Create 2 candidates for dev-senior-adelia → both submit → /recruit/reports/comparison/{posteId} | Side-by-side radar on legacy-ibmi-adelia, core-engineering, domain-knowledge. Scores and rankings. |
| RC-5 | Candidate sees correct categories | Create candidate for architecte-si → open /evaluate/{id} | Form starts with architecture-governance (first in architecte-si role_categories), then core-engineering, backend-integration, etc. |
| RC-6 | CV extraction matches role categories | Upload CV for a Legacy candidate | AI extracts skills and maps to legacy-ibmi-adelia, core-engineering skills. Suggestions appear in form. |

### E. Data Integrity & Permissions

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| P-1 | Non-recruitment-lead can't access recruit pages | Log in as regular dev → navigate to /recruit | Redirected or 403. Only recruitment leads (yolan, pierre, alexandre, olivier, guillaume) can access. |
| P-2 | Member can't edit another member's form | Log in as yolan → navigate to /form/alexandre-thomas | Ownership check blocks editing. Read-only or redirect. |
| P-3 | Candidate can't access team dashboards | Open /evaluate/{id} → try navigating to /dashboard | No session → dashboard requires auth. Redirect to login. |
| P-4 | Autosave doesn't overwrite submitted evaluation | Submit form → navigate back to /form/{slug} → change a rating | Autosave should still work (updating the submitted evaluation). Submitted status preserved. |
| P-5 | Rate limiting on AI features | Spam the "Comparer avec l'IA" button | chat_usage table enforces rate limits. Returns 429 after threshold. |
| P-6 | Invalid pole in API call | GET /api/catalog/pole-categories/invalid_pole | Returns 400 "Pôle invalide". |
| P-7 | SQL injection in pole parameter | GET /api/aggregates?pole='; DROP TABLE evaluations;-- | Parameterized query. No injection. Returns empty result set. |

### F. Visual / UX Checks

| # | Scenario | What to Check |
|---|----------|--------------|
| V-1 | Pole badges on member cards | Team grid shows colored badges: amber (Legacy), blue (Java/Mod), green (Fonctionnel). No badge for null-pole. |
| V-2 | Globe toggle visual state | Ghost variant when same-pole (default). Default/filled variant when cross-pole active. Tooltip text changes. |
| V-3 | Pole filter dropdown styling | Consistent with other selects. Shows current pole name. Dropdown items match POLE_LABELS. |
| V-4 | "Add extra categories" button placement | Appears on review step, above the review table, inside a dashed border card. Only when extras available. |
| V-5 | Progress bar with pole filtering | Shows correct number of steps. Pole categories have role-category visual indicator. Extra categories (if shown) are visually different. |
| V-6 | Dark mode | All new elements (pole badges, globe toggle, pole dropdown, extra categories card) render correctly in dark mode. |
| V-7 | Mobile responsiveness | Form wizard on mobile: extra categories button is tappable. Dashboard pole dropdown doesn't overflow. Globe toggle is reachable. |
| V-8 | Empty state for zero-submission pole | When filtering to a pole with no submissions: meaningful empty message, not a broken layout or spinner stuck. |
| V-9 | Radar chart with mixed-pole comparison | When comparing cross-pole: categories where one person has 0 don't collapse the chart. Legend distinguishes both people. |
| V-10 | Long category names in progress bar | legacy-ibmi-adelia label "Legacy IBMi & Adélia" fits in the progress pill or truncates gracefully. |

### G. Performance & Load

| # | Scenario | What to Check |
|---|----------|--------------|
| PF-1 | Team aggregate with pole filter | GET /api/aggregates?pole=java_modernisation responds in <200ms with 19 members. |
| PF-2 | Pole-categories endpoint | GET /api/catalog/pole-categories/fonctionnel responds in <50ms (simple DB query). |
| PF-3 | Catalog with pole param | GET /api/catalog?pole=legacy adds isPoleCategory field without significant overhead. |
| PF-4 | Rapid pole filter switching | Switch pole 10 times in quick succession in team tab. No memory leaks, no stacked loading states, final state correct. |
| PF-5 | 50+ team members | Add 40 more members to roster. Team aggregate still responds in <500ms. Dashboard renders without lag. |
