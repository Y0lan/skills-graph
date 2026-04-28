# Inbound email replies — setup (v5.3)

The recruiter's promise from the v5 plan: *"every email exchange in
the candidature timeline so I never have to open Outlook"*. The
outbound side has been live since v4 (Resend). This doc covers the
inbound side — what Yolan / DNS admin must do **outside** this repo
for the receiver code to actually receive mail.

The webhook handler is at:

- `POST /api/recruitment/webhooks/resend-inbound`
- Implementation: `server/routes/recruitment.ts` (search "v5.3")

It accepts a [Resend Inbound](https://resend.com/docs/dashboard/inbound)
payload, matches the `From:` address against `candidates.email`
(case-insensitive), and logs a `candidature_events` row of type
`email_received` for every candidature the candidate has. SSE pings
fire so any open candidature page refreshes the timeline live.

## What you need to do (one-time)

### 1. Pick an inbound address

Choose where candidates' replies should land. Conventions:
- `recrutement@sinapse.nc` — easy to remember, fits the existing
  `radar@sinapse.nc` outbound brand.
- `reply@radar.sinapse.nc` — separate subdomain, clean DNS isolation.

Recommendation: **`recrutement@sinapse.nc`**. Recruiters can give it
verbally over the phone without spelling subdomains.

### 2. Create a Resend Inbound parser

In the Resend dashboard:

1. Go to **Inbound → Add address**.
2. Address: `recrutement@sinapse.nc` (or your choice).
3. Forward to webhook: `https://radar.sinapse.nc/api/recruitment/webhooks/resend-inbound`
4. Save the webhook signing secret Resend gives you.

### 3. Set the env var on the cluster

```bash
# In Infisical (or wherever skill-radar-secrets is managed):
RESEND_INBOUND_WEBHOOK_SECRET=<the secret from step 2>
```

Restart the deployment (or wait for the next deploy).

### 4. Wire DNS

Resend Inbound needs MX records pointing at their inbound endpoint.
On Cloud DNS (or Cloudflare or wherever sinapse.nc is hosted), add:

```
recrutement.sinapse.nc.   IN MX 10  inbound.resend.com.
```

If you picked the bare `@sinapse.nc` route, that is more invasive
because you'd need to redirect all sinapse.nc mail to Resend. Pick a
subdomain.

Resend's docs cover the exact MX target — confirm with their
[inbound setup guide](https://resend.com/docs/dashboard/inbound).

### 5. Verify

Send a test email from any external address to
`recrutement@sinapse.nc` mentioning a candidate's name. Within a few
seconds:

1. The Resend dashboard's Inbound log should show the message.
2. The candidate's `/recruit/<id>` page should show a new
   `email_received` event in the timeline. The body is the email
   text, the subject is bold at the top.

If step 1 succeeds but step 2 doesn't:
- Check the candidate has `email = <sender address>` (case-insensitive,
  exact match — we don't fuzzy-match yet).
- Check the webhook secret matches.
- Check `kubectl logs deploy/skill-radar -n public-webapp` for
  `[INBOUND]` lines.

## Behaviour

- **Match algorithm**: `LOWER(candidates.email) = LOWER(inbound.from)`.
  No fuzzy/alias matching in v5.3. If a candidate replies from a
  different address than they applied with, the message will not match
  and we'll log a warning. This is fine for v1; we can add a
  `candidate_aliases` table later if needed.
- **Multi-poste**: if the candidate has 2+ candidatures, the reply is
  attached to **every** candidature so it shows on each timeline. This
  is the correct behaviour — recruiters viewing any candidature for
  this candidate need to see the reply.
- **Idempotency**: the handler dedupes by `messageId` so a Resend
  retry won't double-log.
- **Spam / unmatched**: we log a warning and 200 to Resend. No DLQ —
  if you ever need one, add a `candidature_events_unmatched` table.

## Limits

- **No attachment download**. The handler stores attachment metadata
  (filename + contentType) in `email_snapshot.attachments[]` but does
  not fetch and store the attachment bytes. v5.3 ships read-only
  metadata; v6 (when explicitly asked) can download to GCS and link.
- **HTML stripped to plain text**. Inbound HTML emails get their tags
  stripped and whitespace collapsed. If a recruiter wants the rich
  HTML preserved, that's a v6 follow-up (probably store the HTML
  alongside `content_md` and render in a sandboxed iframe like the
  outbound emails-card already does).

## Local dev / testing without DNS

Resend Inbound has a "test webhook" button in the dashboard that
sends a synthetic payload to your endpoint. Point it at your tunnel
(ngrok, cloudflared) and verify. You don't need the MX records
configured to test the handler — only to receive real mail.
