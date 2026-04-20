# Email templates

All recruitment emails are React Email components rendered server-side via
`@react-email/components`'s `render()` and sent through Resend.

## Layout + brand tokens

- **`server/emails/sinapse-layout.tsx`** — outer table layout, header padding,
  footer with team block + website + LinkedIn + address.
- **`server/lib/brand.ts`** — single source of truth for colors, fonts, name,
  taglines, and URLs. Update here, every template re-renders consistently.

The layout doesn't host a logo image yet — the footer is text-based for
maximum email-client compatibility. Add an image asset only after a Litmus /
manual cross-client check (Outlook web does NOT block remote images by
default; iOS Mail does).

## Templates inventory

| Template | File | Purpose | Recipient |
|---|---|---|---|
| `CandidateInvite` | `server/emails/candidate-invite.tsx` | "Voici le lien de votre auto-évaluation" | Candidate |
| `CandidateSubmitted` | `server/emails/candidate-submitted.tsx` | "Le candidat a soumis son évaluation" | Lead |
| `CandidatureRecue` | `server/emails/candidature-recue.tsx` | "Nous avons bien reçu votre candidature" | Candidate |
| `CandidatureRecueLead` | `server/emails/candidature-recue.tsx` (named export) | "Nouvelle candidature reçue : Marie Dupont — Tech Lead Java" | Lead |
| `CandidatureRefusee` | `server/emails/candidature-refusee.tsx` | Decline notice | Candidate |
| `TransitionNotification` | `server/emails/transition-notification.tsx` | Generic per-statut update | Candidate |
| `(in-line markdown)` | rendered via `wrapInEmailLayout()` in `email.ts` | Recruiter's custom-body override on a transition | Candidate |

## Send pipeline

```
sendXxx() in server/lib/email.ts
  └→ render(<Template/>) → HTML string
  └→ resend.emails.send({ from, to, subject, html })
```

## Renderer contract (Item 17)

Transition emails (preselectionne, refuse, entretien_1, etc.) all flow through
**one** function:

```ts
// server/lib/email.ts
renderTransitionEmail({ statut, candidateName, role, customBody?, ... })
  → { subject, html } | null   // pure, no side effects, no Resend
```

Used identically by:
- `sendTransitionEmail` (real send)
- `POST /api/recruitment/emails/preview` (Item 16 — recruiter sees actual HTML)
- `/dev/emails/transition-{statut}` (this dev tool)
- AI body wrapper (Item 18 — slot the AI output through `customBody`)

If you add a new statut, add a `case` to `getEmailTemplate()` and to
`buildDefaultHtml()` — the renderer picks them up automatically.

## Dev preview tool

`/dev/emails` (mounted only when `NODE_ENV !== 'production'`, requires
recruitment lead session). Lists every template with mock data, opens each
in an iframe so you can iterate copy + spacing without sending.

To add a new preview: add an entry to `PREVIEWS` in
`server/routes/dev-emails.ts` with a `slug`, `label`, and async `render()`.

## Adding a new template

1. Create `server/emails/your-template.tsx`. Wrap content in `<SinapseLayout>`.
   Use `BRAND.*` tokens for any colors / URLs you reference.
2. Add a `sendYourTemplate(opts)` async function in `server/lib/email.ts`
   that calls `render(<YourTemplate/>)` and `resend.emails.send(...)`.
3. Wire it into the route that triggers the send.
4. Register a preview in `server/routes/dev-emails.ts` so designers can
   iterate.
5. Add a manual sanity check: open the dev preview in Gmail web, Outlook
   web, and iOS Mail (paste the HTML into a test message). Commit a
   screenshot to `docs/emails-screenshots/` for the record.

## Cross-client compatibility notes

- **Use inline styles**, not classes. Email clients strip `<style>` tags.
- Outer `<table role="presentation">` is the standard layout primitive
  (CSS flexbox / grid don't render in Outlook).
- Keep total HTML <100 KB to avoid Gmail clipping.
- Test font fallbacks — `BRAND.fontFamily` uses the system stack so iOS
  / macOS / Windows render natively.

## Anti-patterns

- ❌ Don't `<img src="https://internal.url/...">` on assets that aren't
  CDN-published — internal hosts may not be reachable from the recipient's
  email client.
- ❌ Don't put recruiter PII in templates (we render with mock data via
  the dev tool — production sends use real data, but the templates
  themselves should be fully parameterised).
- ❌ Don't skip `escapeHtml()` on user-controlled fields — Resend doesn't
  escape for you.
