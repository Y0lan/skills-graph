# Candidate cockpit v4 — 46-action regression matrix

Companion to commit `e42def7` and follow-ups. Every recruiter action that
existed on `/recruit/<candidateId>` before the redesign maps to its new home,
with the file path + line range to verify, plus the test (where one exists)
that locks the behaviour down. If a row says "manual smoke", the action is
purely UI plumbing with no automated coverage and a recruiter must click
through it in the dev environment after deploy.

Numbering matches the inventory in the original asks
(`/tmp/candidate-page-inventory.md`).

## Navigation & session

| # | Action | Old home | New home | Verification |
|---|--------|----------|----------|--------------|
| 1 | Retour → /recruit | top bar `Link` | unchanged — top bar `Link` in `candidate-detail-page.tsx` | manual smoke |
| 2 | Prev sibling navigation | sibling chip `Button` | unchanged — same chip; sibling fetch now in `useEffect` not `useState` initializer | `candidate-detail-page.tsx` siblings `useEffect` |
| 3 | Next sibling navigation | sibling chip `Button` | unchanged — same | manual smoke |
| 4 | Switch candidature (URL `?c=`) | `CandidatureSwitcher` row click | unchanged — same component; `CandidatureWorkspace` re-mounts via `key` so per-cand state never leaks | manual smoke |
| 5 | Toggle "Voir profil détaillé" | global localStorage flag | per-candidate key `candidate-profile-expanded:<id>` + one-time migration | `candidate-detail-page.tsx` `profileStorageKey` effect |

## CV extraction

| # | Action | Old home | New home | Verification |
|---|--------|----------|----------|--------------|
| 6 | Relancer extraction CV | `ExtractionStatusBanner` | unchanged | `ExtractionStatusBanner` props/handler |

## Candidature header utilities

| # | Action | Old home | New home | Verification |
|---|--------|----------|----------|--------------|
| 7 | Copier le lien Skill Radar | header `Button` | unchanged — same gate (`!submitted && !expired && statut ∈ {postule, preselectionne, skill_radar_envoye}`) | `candidature-workspace.tsx` `canCopyLink` + `handleCopyLink` |
| 8 | Rouvrir l'évaluation | header `Button` | unchanged | `candidature-workspace.tsx` `handleReopen` |

## Primary transition actions

| # | Action | Old home | New home | Verification |
|---|--------|----------|----------|--------------|
| 9 | Click primary forward transition | actions column big button | actions column big button + consequence line under | `candidature-workspace.tsx` Prochaine action block; consequence text from `transitionConsequence(target)` in `lib/constants.ts` |
| 10 | Click alternative forward transition | outline button | outline button + consequence line | same block |
| 11 | Click skip transition | ghost button "(sauter N)" | ghost button "· saute Aboro" (real labels) + consequence line | same block; uses `STATUT_LABELS[skipped]` |
| 12 | Click "Refuser la candidature" | destructive button | destructive button + consequence "envoie un email de refus obligatoire" | same block |

## Scheduled email banner

| # | Action | Old home | New home | Verification |
|---|--------|----------|----------|--------------|
| 13 | Send-now from banner | `ScheduledEmailBanner` | unchanged + ConfirmDialog gate | `confirmSendNow` in detail page; `ConfirmDialog` instance |
| 14 | Cancel from banner | `ScheduledEmailBanner` | unchanged + ConfirmDialog gate | `confirmRevertStatus` in detail page; `ConfirmDialog` instance |

## Revert window

| # | Action | Old home | New home | Verification |
|---|--------|----------|----------|--------------|
| 15 | Send now (within 10-min window) | inline button "(N min restantes)" | `RevertCountdown` component, deadline absolute "Annulable jusqu'à 14:32" | `revert-countdown.tsx`; gating logic still in `candidature-workspace.tsx` `revertBlock` memo |
| 16 | Annuler la transition | inline button | `RevertCountdown` button + ConfirmDialog | `revert-countdown.tsx` + detail page ConfirmDialog |

## Inside transition dialog

| # | Action | Old home | New home | Verification |
|---|--------|----------|----------|--------------|
| 17 | Toggle "Envoyer l'email au candidat" | dialog | unchanged | `candidate-detail-page.tsx` template branch |
| 18 | Skip-email reason (10-char min, audit-logged) | dialog textarea | unchanged | same |
| 19 | Edit email subject / body | dialog textarea | unchanged | same |
| 20 | Modifier avec l'IA (Wand2 + Ctrl+Enter apply) | `AiInstructionBar` | unchanged | `AiInstructionBar` component |
| 21 | Aperçu HTML (iframe sandbox="") | nested `Dialog` with `srcDoc` | unchanged — `<iframe sandbox="">` confirmed | `candidate-detail-page.tsx` emailPreviewOpen Dialog |
| 22 | Inclure motif dans l'email (refuse only) | checkbox | unchanged | same |
| 23 | Raison du saut (isSkip required) | textarea | unchanged | same |
| 24 | Notes internes (markdown + Editer/Aperçu) | textarea + ReactMarkdown toggle | unchanged | same |
| 25 | Date de passage Aboro (targetStatut=aboro) | date input | unchanged | same |
| 26 | Drop file / click to pick | clickable `<div>` | semantic `<label htmlFor="transition-file-input">` + `sr-only` input + visible focus ring | `candidate-detail-page.tsx` dropzone block (a11y improvement) |
| 27 | Clear selected file | X on Badge | unchanged | same |
| 28 | Confirmer (dynamic label) | `AlertDialogAction` | unchanged | same |
| 29 | Annuler dialog | `AlertDialogCancel` | unchanged + adds reset of email assistants | same |

## Documents panel

| # | Action | Old home | New home | Verification |
|---|--------|----------|----------|--------------|
| 30 | Upload document (drag-drop or click) | `CandidateDocumentsPanel` | unchanged + new `DocumentSlotSummary` adds compact slot legend above | `document-slot-summary.tsx` jumps to `#documents-complet` anchor |
| 31 | Change document type | `CandidateDocumentsPanel` | unchanged | same |
| 32 | Rename document | `CandidateDocumentsPanel` | unchanged | same |
| 33 | Preview document | `CandidateDocumentsPanel` | unchanged | same |
| 34 | Download document | `CandidateDocumentsPanel` | unchanged | same |
| 35 | Delete document | `CandidateDocumentsPanel` | unchanged (still uses native `confirm()` *inside the panel* — out of scope for this PR; ticket below) | same |
| 36 | Scan status badge per doc | `CandidateDocumentsPanel` + SSE | unchanged — SSE handler still keys by `subscribedId` | `candidate-detail-page.tsx` `useCandidatureEventStream` |

## Notes & Aboro

| # | Action | Old home | New home | Verification |
|---|--------|----------|----------|--------------|
| 37 | Edit structured 4-field notes | `CandidateNotesSection`, gated on `submitted` | always available — moved out of `isPending` gate | `candidature-workspace.tsx` notes section position |
| 38 | Save structured notes | `CandidateNotesSection` button | unchanged | `CandidateNotesSection` |
| 39 | Add/edit Aboro manually | `AboroProfileSection` | gated to `!isPending` (was unconditional) — surface only renders post-submission | `candidature-workspace.tsx` Aboro block |

## Analyse / radar / gap / multi-poste

| # | Action | Old home | New home | Verification |
|---|--------|----------|----------|--------------|
| 40 | Générer l'analyse IA | `FitReport` card button | inside `EvaluationDisclosure` (default closed) | `candidature-workspace.tsx` Analyse IA card inside disclosure |
| 41 | Toggle radar overlay (candidate vs team) | `VisxRadarChart` `showOverlayToggle` | unchanged, hosted inside `EvaluationDisclosure` | same |
| — | Read gap table | bare 3-col matrix | `GapSynthesis`: top-3 Renforts + top-3 À couvrir + full `<details>` table | `gap-synthesis.tsx`; 5 unit tests in `__tests__/gap-synthesis.test.tsx` |
| — | Read bonus skills | strip below gap table | inside `EvaluationDisclosure`, after the gap | same |
| — | Read multi-poste | strip below gap | inside `EvaluationDisclosure`, after Analyse IA | same |

## Historique complet

| # | Action | Old home | New home | Verification |
|---|--------|----------|----------|--------------|
| 42 | Expand/collapse stage | `CandidateHistoryByStage` accordion (current + previous open) | accordion, current-only open by default; refused exit pair preserved when terminal | `candidate-history-by-stage.tsx` `defaultOpen` build |
| 43 | Read transition note (markdown) | `EventRow` ReactMarkdown | unchanged + new shared view-model in `lib/recruitment-events.ts` for new surfaces | `eventMarkdownBody`; 5 unit tests in `__tests__/recruitment-events.test.ts` |
| 44 | View attached document on transition | `EventRow` document chip | unchanged | `EventRow` |
| 45 | Preview/download document from history | `EventRow` `Eye` / `Download` buttons | unchanged | same |

## Email preview sub-dialog

| # | Action | Old home | New home | Verification |
|---|--------|----------|----------|--------------|
| 46 | Open HTML email preview | `Dialog` + sandboxed iframe | unchanged | `candidate-detail-page.tsx` emailPreviewOpen |

---

## New surfaces introduced (not regressions, additive)

| New action | Component | Backend | Tests |
|------------|-----------|---------|-------|
| Sticky compact header (avatar + statut + primary CTA) appears on scroll past identity strip | `candidate-sticky-header.tsx` | n/a (CTA derives from `allowedTransitions`) | manual smoke |
| Journal récent (5 most recent events under the stepper) | `recent-journal.tsx` | reads existing `events` prop | manual smoke; view-model logic covered by `__tests__/recruitment-events.test.ts` |
| Quick note composer (markdown + Ctrl+Enter publish) | `quick-note-composer.tsx` | `POST /api/recruitment/candidatures/:id/events/note` | 7 backend tests in `__tests__/candidature-notes-timeline.test.ts` |
| ConfirmDialog (replaces 3× `window.confirm`) | `confirm-dialog.tsx` | n/a | manual smoke (planned a11y test follow-up) |
| Revert countdown bar with absolute deadline | `revert-countdown.tsx` | n/a | manual smoke |
| Score tile with `tauxGlobal` + "À compléter" empty state | refactor of `candidate-score-summary.tsx` | n/a | manual smoke |
| Document slot summary (compact CV / Lettre / Aboro chips) | `document-slot-summary.tsx` | n/a | manual smoke |
| Évaluation détaillée disclosure (per-candidature persisted) | `evaluation-disclosure.tsx` | localStorage `eval-disclosure:<candidatureId>` | manual smoke |
| Mobile context header inside transition dialog (scores + dossier) | `candidate-detail-page.tsx` inside dialog | n/a | manual smoke |
| Pipeline stepper "Action suivante" derived from `allowedTransitions` | refactor of `candidate-pipeline-stepper.tsx` | n/a | manual smoke |

## Known follow-up tickets (deliberately out of scope this PR)

- **Ad-hoc email flow** ("Envoyer un message" outside a transition) — codex #2 J5 partial. Backend endpoint required; deferred to v2.5.
- **Terminal "Corriger l'état interne" CTA** — backend currently rejects with 422 when no scheduled email remains; deferred until backend supports correction-only revert.
- **Replace `confirm()` inside `CandidateDocumentsPanel` delete flow (action 35)** — out of scope for cockpit redesign; same `ConfirmDialog` primitive can be reused.
- **Quick-note SSE channel** (`note_created` on `recruitmentBus`) — for multi-tab sync. Today the window-focus refresh covers it.
- **Full unified feed replacing emails-card** — the emails-card stays separate. `recent-journal.tsx` shares the view model so future merge is cheap.
