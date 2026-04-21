# SINAPSE Webhook — Drupal delta note

> **NOT DEPLOYABLE.** This directory is a delta note, not a module source.
> The live module lives in the sinapse.nc Drupal repo (not in this workspace).
> To see what's actually running: `kubectl exec -n apps <drupal-pod> -c drupal -- cat /opt/drupal/web/web/modules/custom/sinapse_webhook/...`

## The only change to apply

Radar-side idempotency (`drupal_submission_id` column + partial unique index)
is already live on the radar, backward-compatible: if Drupal doesn't send the
field, radar creates the candidature as before.

To **activate** idempotent replay (so queue retries don't create duplicates),
add one line to the payload built by `SkillRadarHandler::postSave()` in the
real Drupal repo:

```php
$payload = [
    'nom'           => $data['nom'] ?? '',
    // ... other fields unchanged ...
    'canal'         => 'site',
    'submission_id' => $webform_submission->uuid(),  // ← add this line
];
```

That's the whole delta. `submission_id` is the Drupal submission UUID;
radar uses it as an idempotency key (see `drupal_submission_id` partial
unique index on the `candidatures` table, commit `e2ffb00`).

## Why the old drafts were removed

Earlier drafts in this folder (`SkillRadarSendWorker.php`, a rewritten
`SkillRadarHandler.php`) proposed switching to async-only enqueue with
`SuspendQueueException`. That would have:

- regressed `lettre` (cover letter) support — the drafts only handled CV,
- lost the sync-first dispatch path (candidate appears instantly),
- changed plugin id from `skill_radar_intake` to `sinapse_webhook_send`,
  orphaning any items already in the live queue.

The live handler (deployed Apr 21) already does sync-first + queue
fallback with `MAX_ATTEMPTS=3` via `RequeueException`. That's the
zero-data-loss guarantee; the only missing piece is the `submission_id`
idempotency key above.
