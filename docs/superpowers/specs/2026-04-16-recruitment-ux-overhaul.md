# Recruitment UX Overhaul

**Date:** 2026-04-16
**Status:** Draft
**Scope:** Email branding, email tracking, candidate profile page redesign, pipeline improvements, team table view

## Context

The recruitment module is functional but the UX falls short during real usage. Candidates applied via sinapse.nc but emails used generic templates instead of SINAPSE branding. The candidate profile page (/recruit/:id) doesn't show full details, the timeline is hard to read, documents aren't downloadable, and the "Présélectionné" transition is broken. Team members are only visible in a dropdown with no full table view.

## Phase 1 — Immediate Fixes

### 1.1 Fix "Présélectionné" Transition Bug

The transition dialog opens but clicking "Confirmer" fails. Investigate the `PATCH /api/recruitment/candidatures/{id}/status` endpoint for the `preselectionne` status. Check allowed transitions in the server-side state machine and fix the validation or frontend payload.

**Files:** `server/routes/recruitment.ts` (transition endpoint), `src/hooks/use-transition-state.ts` (frontend call)

### 1.2 Delete Candidate from Pipeline View

Add a delete action to kanban cards on `/recruit/pipeline`, matching the existing delete functionality on `/recruit`.

**Approach:** Reuse the existing `DELETE /api/ratings/:slug` endpoint. Add a context menu or trash icon to `kanban-board.tsx` KanbanCard component. Show confirmation dialog before deleting.

**Files:** `src/components/recruit/kanban-board.tsx`

### 1.3 CI Pipeline SA (Done)

Changed `terraform-deployer` to `github-deploy` SA in `deploy-dev.yml`. Committed and pushed (de58315).

### 1.4 Drupal Sync Dispatch (Done)

Updated `SkillRadarHandler.php` to dispatch synchronously with queue fallback. Pushed to `cloud-sinapse-infra` repo (90cf44da). Pending Drupal image rebuild.

## Phase 2 — Email Overhaul

### 2.1 "Candidature Received" Email

Replace the current plain template in `sendApplicationReceived()` with the official SINAPSE branding.

**Template content (from Guillaume's email):**

> Bonjour,
>
> Nous vous remercions vivement pour l'interet que vous portez au GIE SINAPSE et a son projet de refonte des parcours des travailleurs independants, des employeurs ainsi que des socles transverses, briques fondamentales du SI CAFAT.
>
> Le GIE SINAPSE intervient en tant qu'assistant a maitrise d'ouvrage pour le compte de la CAFAT sur ce programme structurant, pilier de sa transformation digitale.
>
> Afin de garantir un traitement equitable et structure des candidatures, celles-ci doivent imperativement etre deposees via notre site internet :
> https://www.sinapse.nc
>
> Nous vous invitons a completer l'ensemble du parcours de candidature avec la plus grande attention, en particulier le questionnaire, qui constitue un element determinant dans l'analyse de l'adequation entre votre profil et les enjeux portes par SINAPSE.
>
> En l'absence de reponse de notre part dans un delai de 15 jours, vous pourrez considerer que nous ne sommes pas en mesure de donner une suite favorable a votre candidature.
>
> Nous vous remercions pour votre demarche et vous souhaitons pleine reussite dans vos projets professionnels.
>
> Cordialement,

**Branding elements:**
- SINAPSE logo at top (hosted image or inline)
- Signature block: "Team — GIE SINAPSE", tagline "Du code et du sens · Transformation numerique de la protection sociale de Nouvelle Caledonie"
- Links: www.sinapse.nc, LinkedIn (GIE SINAPSE)
- Footer: BP L5 98849 NOUMEA CEDEX, Nouvelle-Caledonie
- Teal accent color (#008272) matching SINAPSE brand

**Dynamic fields:** Candidate name in greeting ("Bonjour {name}"), poste name in subject line.

**Recipients:** Candidate email + lead email (existing) + director email (new, configurable).

**File:** `server/lib/email.ts` — `sendApplicationReceived()`

### 2.2 "Refus" (Decline) Email

Replace the current template in `sendCandidateDeclined()` with the official SINAPSE refus template.

**Template content (from contact@sinapse.nc):**

> Bonjour Monsieur/Madame {candidateName},
>
> Nous vous remercions chaleureusement pour l'interet que vous portez au GIE SINAPSE ainsi que pour votre candidature.
>
> Apres avoir examine attentivement votre dossier, nous avons le regret de vous informer que votre profil ne correspond pas a nos besoins actuels.
>
> Nous vous souhaitons une bonne continuation dans la poursuite de vos recherches.
>
> Cordialement,

**Branding:** Same SINAPSE signature block, logo, teal accent as 2.1.

**Dynamic fields:** Candidate name (with Monsieur/Madame), poste name.

**Recipients:** Candidate email + lead notification (existing).

**File:** `server/lib/email.ts` — `sendCandidateDeclined()`

### 2.3 Shared Email Layout

Create a reusable SINAPSE email layout function used by all email templates:
- Logo header
- Content area
- Signature block (Team — GIE SINAPSE)
- Footer with links and address
- Teal accent color (#008272)
- Mobile-responsive inline CSS

**File:** `server/lib/email.ts` — new `wrapInSinapseLayout()` function (replace existing `wrapInEmailLayout`)

### 2.4 Resend Webhook — Email Open Tracking

Wire up Resend's webhook events to track email delivery and opens.

**Resend events to track:**
- `email.delivered` — email reached the recipient's inbox
- `email.opened` — recipient opened the email
- `email.bounced` — delivery failed
- `email.clicked` — recipient clicked a link (if applicable)

**Implementation:**
1. Store Resend `messageId` when sending each email (already returned by the Resend API)
2. Create endpoint `POST /api/webhooks/resend` to receive Resend webhook events
3. On event receipt: match `messageId` to `candidature_events.email_snapshot`, update with delivery/open timestamp
4. Add columns to `candidature_events`: `email_message_id`, `email_delivered_at`, `email_opened_at`
5. Display status badges in the timeline: "Envoye" → "Livre" → "Ouvert (il y a 2h)"

**Auth:** Validate Resend webhook signature using `RESEND_WEBHOOK_SECRET`.

**Known issue:** The current webhook route at `/recruitment/webhooks/resend` is unreachable due to mount order bug (line 1133 of recruitment.ts where `protectedRouter.use('/')` intercepts before the webhook handler). Fix: move webhook route registration before the catch-all protected router mount.

**Files:** `server/routes/recruitment.ts`, `server/lib/db.ts` (schema), `server/lib/email.ts` (store messageId)

## Phase 3 — Candidate Profile Page Overhaul (/recruit/:id)

### 3.1 Full Candidate Details Section

Display all candidate information prominently at the top of the profile:
- Name, email, phone, pays
- LinkedIn URL (clickable), GitHub URL (clickable)
- Poste applied for, pole
- Source canal (site, email, etc.)
- Applied date
- Compatibility scores: poste, equipe, global, soft skills (with visual bars)

**Current gap:** Some fields exist in the DB but aren't rendered. The page fetches data but doesn't display telephone, pays, linkedin_url, github_url.

**File:** `src/pages/candidate-detail-page.tsx`

### 3.2 Document Panel — Prominent Downloads

Make CV and motivation letter downloads immediately visible and accessible:
- Large download buttons with file type icons (PDF, DOCX, etc.)
- File name and upload date shown
- Preview capability for PDFs if possible (or at minimum, open in new tab)

**Current state:** `candidate-documents-panel.tsx` has download via `window.open()` but it may not be surfaced prominently enough.

**File:** `src/components/recruit/candidate-documents-panel.tsx`

### 3.3 Timeline Overhaul

Redesign the event timeline to be fully readable and informative:

**Current problems:**
- Notes are truncated with ellipsis
- Email snapshots are raw JSON strings
- No document links inline with events
- Expand/collapse is not obvious

**New design:**
- Each event is a card with:
  - Status badge (from → to) with colored accent
  - Timestamp + who performed the action
  - Full notes text (no truncation, rendered as markdown)
  - Email status: sent/delivered/opened with timestamps (from Phase 2.4)
  - Attached documents with download links
- Events are expanded by default (most recent first)
- Older events can be collapsed

**File:** `src/components/recruit/candidate-status-bar.tsx` (the timeline section, lines 200-264)

### 3.4 Visual Pipeline Stepper

Add a horizontal stepper at the top of the profile showing all pipeline stages with the current stage highlighted:

`Postule → Preselectionne → Skill Radar → Entretien 1 → Entretien 2 → Proposition → Embauche`

- Completed steps: filled/green
- Current step: highlighted/active
- Future steps: dimmed
- Refused: red indicator at the step where rejection happened

**File:** `src/pages/candidate-detail-page.tsx` (new component)

## Phase 4 — Team Table View

### 4.1 New Route: /equipe

Full-page table view of all team members.

**Table columns:**
| Column | Source |
|--------|--------|
| Name | `evaluations.slug` display name |
| Role | Team member role/title |
| Pole | Which pole they belong to |
| Skill Radar Score | Average or latest skill radar score |
| Evaluation Completion | X/Y evaluations completed (with progress indicator) |

**Row interactions:**
- Click name or eye icon → navigate to existing team member profile page (`/evaluate/:slug/team`)
- Sortable columns
- Filterable by pole

### 4.2 Fullscreen Icon on Equipe Dropdown

Add a small expand/fullscreen icon (e.g., `Maximize2` from Lucide) in the top-right corner of the Equipe dropdown/popover. Clicking it navigates to `/equipe`.

**File:** Wherever the Equipe dropdown is rendered (likely a header/nav component)

## Future TODO — Recruitment Funnel Sankey Diagram

**Not in scope for this sprint.** Add to TODOS.md.

A Sankey/flow diagram visualizing the full recruitment funnel:
- Left: all candidates who applied (Postule)
- Flows branching through each pipeline stage
- Shows drop-off at each stage (refused, withdrawn)
- Right: final outcomes (Embauche, Refuse)
- Inspired by dating app funnel visualization

Could use a library like `recharts` (already in the project), `d3-sankey`, or `react-flow`.

**Data source:** Aggregate `candidatures` table by `statut` + `candidature_events` for transitions.

## Technical Notes

### Email layout shared function

All email templates should use a single `wrapInSinapseLayout(content: string)` function that provides:
- Consistent header with logo
- Content wrapper with max-width 560px
- Signature block
- Footer
- Inline CSS for email client compatibility

### Webhook mount order fix

The Resend webhook route must be registered BEFORE the `protectedRouter.use('/')` catch-all at line 1133 of `recruitment.ts`. Otherwise the `requireLead` middleware intercepts the webhook request.

### Data leak fix

`useCandidateData()` fetches ALL candidatures and filters client-side. Should add `?candidateId=` query param to the API and filter server-side. This is a security and performance issue.

## File Impact Summary

| File | Changes |
|------|---------|
| `server/lib/email.ts` | Rewrite templates, add SINAPSE layout, store messageId |
| `server/routes/recruitment.ts` | Fix webhook mount order, fix transition validation, add Resend webhook handler |
| `server/lib/db.ts` | Add email tracking columns to candidature_events |
| `src/pages/candidate-detail-page.tsx` | Full details section, pipeline stepper, layout overhaul |
| `src/components/recruit/candidate-status-bar.tsx` | Timeline redesign |
| `src/components/recruit/candidate-documents-panel.tsx` | Prominent download buttons |
| `src/components/recruit/kanban-board.tsx` | Delete action on cards |
| `src/pages/equipe-page.tsx` | New team table page |
| `src/hooks/use-candidate-data.ts` | Server-side filtering |
| `src/hooks/use-transition-state.ts` | Fix transition payload |
| `.github/workflows/deploy-dev.yml` | SA fix (done) |
