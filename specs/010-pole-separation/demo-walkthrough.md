# Demo Walkthrough — Skill Radar + Pole Separation

**Target:** dev.radar.sinapse.nc
**Purpose:** Walk through every persona, note friction, spot bugs before director demo
**Duration:** ~45 min if nothing breaks

---

## Pre-flight

1. Open dev.radar.sinapse.nc in Chrome
2. Have a second browser (or incognito) ready for candidate testing
3. Keep this doc open side-by-side
4. For each step: do the action, check the expected result, note any issue in the "Notes" column

---

## Walkthrough 1: Guillaume (Directeur) — Full recruitment flow

> Guillaume is the primary user. He sees everything, manages the pipeline, compares candidates.

### 1A. Login & Landing

| Step | Action | Expected | Notes |
|------|--------|----------|-------|
| 1 | Open dev.radar.sinapse.nc | Landing page with "Se connecter" button | |
| 2 | Click "Se connecter" | Login form (email + PIN) | |
| 3 | Log in as guillaume.benoit@sinapse.nc | Redirected to dashboard | If PIN unknown, need to reset via kubectl |
| 4 | Check header | Shows "Guillaume B." or avatar | |

### 1B. Dashboard — Team overview (pole: null = sees all)

| Step | Action | Expected | Notes |
|------|--------|----------|-------|
| 5 | Click "Équipe" tab | Team overview loads. Pole dropdown shows "Tous les pôles" (Guillaume is pole: null) | |
| 6 | Check team members grid | Should show ~19 members (13 devs + 6 BAs). Each has a pole badge (blue/green/none) | |
| 7 | Switch pole filter to "Fonctionnel" | Grid filters to 6 BAs + 3 null-pole members. Category cards show only fonctionnel categories | |
| 8 | Switch to "Java / Modernisation" | Grid shows 10 devs + null-pole. Categories are the 11 java_mod ones | |
| 9 | Switch to "Legacy" | Grid shows only null-pole members (no legacy recruits yet). Should show empty or minimal state | |
| 10 | Switch back to "Tous les pôles" | Full team restored | |

### 1C. Guillaume's own form (pole: null = all categories)

| Step | Action | Expected | Notes |
|------|--------|----------|-------|
| 11 | Go to /form/guillaume-benoit | Form wizard loads | |
| 12 | Check number of categories in progress bar | Should show ALL 19 categories (pole: null = no filtering) | |
| 13 | All categories should be skippable | Skip button present on every category (null-pole members can skip any) | |
| 14 | Navigate a few steps, verify autosave | "Sauvegardé ✓" appears after rating a skill | |
| 15 | Go back to dashboard | /dashboard/guillaume-benoit loads with his profile | |

### 1D. Recruitment pipeline

| Step | Action | Expected | Notes |
|------|--------|----------|-------|
| 16 | Go to /recruit/pipeline | Pipeline page loads. 3 pole sections: Legacy, Java/Mod, Fonctionnel | |
| 17 | Check 7 postes are listed | Tech Lead Adélia, Dev Senior Adélia, Tech Lead Java, Dev Java FS, Dev JBoss, Architecte SI, Business Analyst | |
| 18 | Check stats per pole | Candidature counts, active counts | |

### 1E. Create a test candidate

| Step | Action | Expected | Notes |
|------|--------|----------|-------|
| 19 | Go to /recruit | Candidate list page | |
| 20 | Click "Nouveau candidat" | Create candidate form | |
| 21 | Fill: Name="Test BA Demo", Role=Business Analyst, Email=test@demo.com | Form accepts input | |
| 22 | Submit | Candidate created. Appears in list | |
| 23 | Copy evaluation link | Clipboard has /evaluate/{id} URL | |
| 24 | Open the link in incognito browser | → Go to Walkthrough 3 (Candidate) | |

### 1F. Create a test Java candidate

| Step | Action | Expected | Notes |
|------|--------|----------|-------|
| 25 | Back to /recruit | Candidate list | |
| 26 | Create: Name="Test Dev Demo", Role=Dev Java Senior Full Stack, Email=testdev@demo.com | Created | |
| 27 | Copy eval link | Save for Walkthrough 4 | |

---

## Walkthrough 2: Yolan (Architecte, java_modernisation pole)

> Current dev team member. Already has ratings. Tests pole filtering on existing data.

### 2A. Dashboard — same-pole comparison

| Step | Action | Expected | Notes |
|------|--------|----------|-------|
| 1 | Log in as yolan.maldonado@sinapse.nc | Dashboard loads with personal profile | |
| 2 | Check comparison dropdown | Should show only java_modernisation members + null-pole (Pierre, Olivier, Guillaume). Should NOT show BAs (Nicolas D., Leila, etc.) | |
| 3 | Select a dev (e.g., Alexandre T.) | Radar overlay appears with both profiles | |
| 4 | Click globe icon (cross-pole toggle) | Dropdown expands to include ALL members (BAs appear now) | |
| 5 | Select a BA | Radar shows both. Shared categories (soft-skills, domain-knowledge, archi) have data. BA-only categories show 0 for Yolan | |
| 6 | Click globe again to disable cross-pole | Dropdown shrinks back to java_mod only. BA comparison cleared | |

### 2B. Form — pole filtering

| Step | Action | Expected | Notes |
|------|--------|----------|-------|
| 7 | Go to /form/yolan-maldonado | Form wizard loads | |
| 8 | Count categories in progress bar | Should show 11 (java_mod pole), NOT 19 | |
| 9 | Navigate to last pole category | "Ajouter des catégories hors pôle" button should NOT appear until review step | |
| 10 | Go to review step | Button appears: "7 catégories supplémentaires disponibles hors de votre pôle" | |
| 11 | Click "Ajouter des catégories hors pôle" | Progress bar expands to 19 categories. Extra categories appear after the 11 pole ones | |
| 12 | Navigate to an extra category (e.g., Analyse Fonctionnelle) | Skip button present (extra categories are skippable) | |
| 13 | Rate one skill in the extra category | Autosave works | |

### 2C. Team tab — pole filter

| Step | Action | Expected | Notes |
|------|--------|----------|-------|
| 14 | Go to /dashboard/yolan-maldonado, click "Équipe" tab | Pole dropdown should default to "Java / Modernisation" (Yolan's pole) | |
| 15 | Check member count | ~13 (10 java_mod + 3 null-pole) | |
| 16 | Switch to "Fonctionnel" | Shows BAs + null-pole. Categories change to fonctionnel ones | |
| 17 | Switch to "Tous" | Everyone visible | |

---

## Walkthrough 3: External Candidate — BA position

> Using the eval link from Walkthrough 1E. In incognito browser (no auth).

### 3A. Candidate form — fonctionnel categories

| Step | Action | Expected | Notes |
|------|--------|----------|-------|
| 1 | Open /evaluate/{id} (from clipboard) | Candidate form loads. No header nav, no dashboard links (isolation) | |
| 2 | Check form title | Shows "Test BA Demo" and role "Business Analyst" | |
| 3 | Check categories in progress bar | Should show ONLY BA role categories: analyse-fonctionnelle, domain-knowledge, project-management-pmo, change-management-training, soft-skills, design-ux. NOT java categories | |
| 4 | Count total steps | Role-specific categories + review step. Should be ~6-7 steps | |
| 5 | Fill a few skills in analyse-fonctionnelle | Rating radio buttons work. Autosave indicator | |
| 6 | Try to skip a role category | Skip button should be ABSENT for role categories (mandatory) | |
| 7 | Navigate through all categories | Each shows correct skills from the v3 referentiel (updated descriptors) | |
| 8 | Check calibration scenarios | Each category shows a SINAPSE-specific scenario in French | |
| 9 | Fill all categories (quick: rate everything 3) | Progress bar fills up | |
| 10 | Reach review step | All ratings displayed in review | |
| 11 | Click "Soumettre" | Analyzing spinner → redirect or success message | |

### 3B. Verify candidate data appeared in Guillaume's view

| Step | Action | Expected | Notes |
|------|--------|----------|-------|
| 12 | Switch to Guillaume's browser | Go to /recruit | |
| 13 | Find "Test BA Demo" in candidate list | Status should be skill_radar_complété (or similar) | |
| 14 | Click into candidate detail | Radar chart shows BA categories with scores. Compatibility % calculated | |
| 15 | Go to /recruit/pipeline | Test BA Demo appears under Fonctionnel pole | |

---

## Walkthrough 4: External Candidate — Java Dev position

> Using the eval link from Walkthrough 1F. Tests that a dev candidate sees different categories than a BA.

### 4A. Candidate form — java categories

| Step | Action | Expected | Notes |
|------|--------|----------|-------|
| 1 | Open /evaluate/{id} (dev candidate) in incognito | Form loads | |
| 2 | Check categories | Should show core-engineering, backend-integration, frontend-ui, platform-engineering, architecture-governance (dev-java-fullstack role categories). NOT analyse-fonctionnelle | |
| 3 | Fill a few categories quickly | Works, autosave | |
| 4 | Submit | Success | |

### 4B. Compare both candidates in pipeline

| Step | Action | Expected | Notes |
|------|--------|----------|-------|
| 5 | As Guillaume, go to /recruit/pipeline | Both test candidates visible in their respective poles | |
| 6 | BA candidate under "Fonctionnel" | Correct | |
| 7 | Dev candidate under "Java / Modernisation" | Correct | |
| 8 | Click into the poste "Dev Java Senior Full Stack" | Comparison view shows the test dev candidate with compatibility score | |

---

## Walkthrough 5: BA Team Member — Nicolas Dufillot

> One of the 6 new BAs. Tests the fonctionnel pole experience for team members.

### 5A. Login & Form

| Step | Action | Expected | Notes |
|------|--------|----------|-------|
| 1 | Log in as nicolas.dufillot@sinapse.nc | Dashboard loads (or needs PIN reset first) | |
| 2 | Go to /form/nicolas-dufillot | Form wizard loads | |
| 3 | Check categories | Should show 9 fonctionnel pole categories: analyse-fonctionnelle, project-management-pmo, change-management-training, design-ux, data-engineering-governance, management-leadership, architecture-governance, soft-skills, domain-knowledge | |
| 4 | Verify skills match v3 referentiel | analyse-fonctionnelle should have 8 skills (including new cross-domain-coordination). design-ux should have 8 (including new usability-testing) | |
| 5 | Check descriptors | Open a descriptor tooltip. Should show French level descriptions from v3 | |
| 6 | Check "add extra" button exists on review | "7 catégories supplémentaires" (the java/legacy ones) | |

### 5B. Dashboard comparison

| Step | Action | Expected | Notes |
|------|--------|----------|-------|
| 7 | Go to /dashboard/nicolas-dufillot | Personal overview | |
| 8 | Check comparison dropdown | Should show other BAs (Nicolas E., Leila, Sonalie, Amine, Audrey) + null-pole members. No devs. | |
| 9 | Toggle cross-pole (globe) | Devs now appear in dropdown | |
| 10 | Team tab | Pole dropdown defaults to "Fonctionnel". Shows 6 BAs + null-pole | |

---

## Walkthrough 6: Pierre Rossato (Manager, pole: null)

> Manager sees all poles by default. Tests the cross-pole management view.

### 6A. Dashboard

| Step | Action | Expected | Notes |
|------|--------|----------|-------|
| 1 | Log in as pierre.rossato@sinapse.nc | Dashboard loads | |
| 2 | Check comparison dropdown | Should show ALL members (pole: null = no filtering). No globe icon (unnecessary) | |
| 3 | Team tab | Pole dropdown defaults to "Tous les pôles" | |
| 4 | Switch to "Java / Modernisation" | Filters correctly | |
| 5 | Switch to "Fonctionnel" | Shows BAs | |

### 6B. Form

| Step | Action | Expected | Notes |
|------|--------|----------|-------|
| 6 | Go to /form/pierre-rossato | All 19 categories visible (pole: null) | |
| 7 | All skippable | Yes | |

---

## Walkthrough 7: Recruitment Reports

> Tests the comparison and campaign report pages.

| Step | Action | Expected | Notes |
|------|--------|----------|-------|
| 1 | Go to /recruit/reports/campaign | Campaign stats page. Shows candidature counts by pole, by status, by canal | |
| 2 | Check pole grouping | 3 poles with correct labels | |
| 3 | Go to /recruit/reports/comparison/{posteId} for BA poste | Shows test BA candidate with radar chart | |
| 4 | Go to comparison for Java poste | Shows test dev candidate | |

---

## Post-Walkthrough Checklist

After completing all walkthroughs, answer these questions:

### UX Issues
- [ ] Were the pole labels clear? ("Legacy (Adélia / IBMi)" vs "Java / Modernisation" vs "Fonctionnel")
- [ ] Was the globe toggle discoverable? Did you understand what it does without reading docs?
- [ ] Was the "add extra categories" button visible enough on the review step?
- [ ] Did the pole filter in the team tab feel intuitive?
- [ ] Were calibration scenarios helpful or ignored?
- [ ] Were the skill descriptors (0-5 levels) clear for BA categories?

### Data Issues
- [ ] Were all 6 BAs showing in the roster?
- [ ] Were all 19 categories present (11 locked + 8 modifiable)?
- [ ] Did the new skills from v3 appear (usability-testing, cross-domain-coordination, etc.)?
- [ ] Were compatibility scores reasonable for test candidates?

### Bugs Found
- [ ] Any JS console errors? (F12 → Console)
- [ ] Any broken layouts on mobile?
- [ ] Any pages that don't load or show spinners forever?
- [ ] Any data that looks wrong (wrong pole assignment, wrong categories)?

### Missing for Director Demo
- [ ] Does Guillaume see what he needs to make recruitment decisions?
- [ ] Can he compare candidates within a pole?
- [ ] Can he see BA team skills separately from dev team?
- [ ] Is the pipeline view clear enough?
- [ ] What would Guillaume ask that we can't answer yet?

---

## How Candidates Enter the System

Candidates NEVER log in to Skill Radar. The flow is:

```
sinapse.nc (Drupal)                    Skill Radar
┌──────────────────┐                  ┌──────────────────────┐
│ Candidat remplit  │  POST webhook   │ Candidat auto-créé   │
│ formulaire        │ ──────────────→ │ CV analysé par IA    │
│ "Postuler"        │ /api/recruit/   │ Compatibilité calc.  │
│ (nom, CV, poste)  │ intake          │ Guillaume notifié    │
└──────────────────┘                  └──────────────────────┘
                                              │
                                    Guillaume envoie lien
                                              │
                                              ▼
                                      /evaluate/{id}
                                      (public, pas d'auth,
                                       expire 30j)
```

**Pour la demo:** créer les candidats manuellement dans /recruit (le webhook Drupal n'est pas encore branché).

---

## Known Limitations (expected, not bugs)

1. **No Legacy team members yet** — Legacy pole filter shows only null-pole members
2. **BAs haven't filled their forms yet** — BA team averages are empty until they submit
3. **Aboro integration is Phase 2** — soft skills scoring not automated yet
4. **Drupal webhook not yet wired on prod** — candidates created manually in /recruit for now
5. **PDF reports not implemented** — campaign and comparison reports are web-only
