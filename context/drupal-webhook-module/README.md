# SINAPSE Webhook — Drupal Module

Forwards `postuler` webform submissions from sinapse.nc to Skill Radar's recruitment API.

## Installation

1. Copy `sinapse_webhook/` to `web/modules/custom/sinapse_webhook/`
2. Enable: `drush en sinapse_webhook`
3. Configure the API URL and webhook secret in `settings.php`:

```php
$config['sinapse_webhook.settings']['api_url'] = 'https://dev.radar.sinapse.nc';
$config['sinapse_webhook.settings']['webhook_secret'] = 'your-shared-secret';
```

4. Update the poste mapping in `config/install/sinapse_webhook.settings.yml`:
   - Check the actual taxonomy term IDs for `thematique_d_emploi` in Drupal
   - Map each term ID to the corresponding Skill Radar poste ID

5. Add the handler to the `postuler` webform:
   - Go to `/admin/structure/webform/manage/postuler/handlers`
   - Click "Add handler"
   - Select "Skill Radar Intake"
   - Save

## How it works

When a candidate submits the `postuler` form on sinapse.nc:

1. The `SkillRadarHandler` fires on `postSave`
2. It maps the Drupal form fields to the Skill Radar intake format:
   - `nom`, `prenom`, `email`, `linkedin`, `github`, `message` -> direct mapping
   - `poste_vise` -> mapped from Drupal taxonomy term ID to Skill Radar poste ID
   - `cv` -> resolved from Drupal file ID to disk path, sent as multipart upload
   - `canal` -> hardcoded to `'site'` (all Drupal submissions)
3. POSTs to `{api_url}/api/recruitment/intake` with `X-Webhook-Secret` header
4. Skill Radar creates the candidate, extracts CV skills via AI, calculates compatibility

## Skill Radar poste IDs

| Poste | Skill Radar ID |
|-------|---------------|
| Tech Lead Adélia | `poste-1-tech-lead-adelia` |
| Dev Senior Adélia | `poste-2-dev-senior-adelia` |
| Tech Lead Java / JBoss | `poste-3-tech-lead-java` |
| Dev Java Senior Full Stack | `poste-4-dev-java-fullstack` |
| Dev JBoss Senior | `poste-5-dev-jboss-senior` |
| Architecte SI Logiciel | `poste-6-architecte-si` |
| Business Analyst | `poste-7-business-analyst` |
| Candidature Libre | `candidature-libre` |

## Error handling

- If the API is unreachable, the Drupal form submission still succeeds (non-blocking)
- Errors are logged to Drupal's watchdog (`drush ws --type=sinapse_webhook`)
- Duplicate submissions (same email + same poste) are handled by Skill Radar (idempotent)

## Webhook secret

Both systems must share the same secret. Set `DRUPAL_WEBHOOK_SECRET` on Skill Radar
and `webhook_secret` in Drupal's config. If empty on Skill Radar, the endpoint is open
(useful for testing, not recommended for production).
