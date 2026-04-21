<?php

namespace Drupal\sinapse_webhook\Plugin\QueueWorker;

use Drupal\Core\Plugin\ContainerFactoryPluginInterface;
use Drupal\Core\Queue\QueueWorkerBase;
use Drupal\Core\Queue\SuspendQueueException;
use Drupal\file\Entity\File;
use Drupal\sinapse_webhook\SkillRadarClient;
use GuzzleHttp\Exception\ConnectException;
use GuzzleHttp\Exception\ServerException;
use Psr\Log\LoggerInterface;
use Symfony\Component\DependencyInjection\ContainerInterface;

/**
 * Re-drives Skill Radar webhook calls with durability.
 *
 * @QueueWorker(
 *   id = "sinapse_webhook_send",
 *   title = @Translation("Send candidature to Skill Radar"),
 *   cron = {"time" = 30}
 * )
 *
 * How it works:
 *  - SkillRadarHandler::postSave() enqueues an item per webform submission.
 *  - Drupal cron (tuned to 60s via the CronJob K8s manifest) calls
 *    processItem() for each queued item up to the 30s budget.
 *  - On success → item deleted automatically.
 *  - On transient failure (connection refused, 5xx, timeout) → throw
 *    SuspendQueueException to stop this cron run and retry the item next
 *    cycle with Drupal's built-in exponential backoff.
 *  - On permanent failure (4xx that isn't rate-limit) → throw a regular
 *    Exception; Drupal re-queues indefinitely until ops intervenes.
 *    Alternative: add a max-retry counter in the payload and drop after N.
 */
class SkillRadarSendWorker extends QueueWorkerBase implements ContainerFactoryPluginInterface {

  protected SkillRadarClient $client;
  protected LoggerInterface $logger;

  public static function create(ContainerInterface $container, array $configuration, $plugin_id, $plugin_definition) {
    $instance = new static($configuration, $plugin_id, $plugin_definition);
    $instance->client = $container->get('sinapse_webhook.skill_radar_client');
    $instance->logger = $container->get('logger.factory')->get('sinapse_webhook');
    return $instance;
  }

  /**
   * {@inheritdoc}
   */
  public function processItem($data) {
    // Re-resolve the CV path from the file id. The path on disk is volatile
    // (Drupal's public/private file dirs can move) but the fid is durable.
    $cv_path = NULL;
    $cv_filename = $data['cv_filename'] ?? NULL;
    if (!empty($data['cv_fid'])) {
      $file = File::load($data['cv_fid']);
      if ($file) {
        $cv_path = \Drupal::service('file_system')->realpath($file->getFileUri());
      }
      else {
        // File was deleted between enqueue and delivery. Log, but still
        // send the payload (candidature record matters; CV can be
        // uploaded manually by a recruiter if really needed).
        $this->logger->warning('CV file fid @fid missing at delivery time for submission @sid', [
          '@fid' => $data['cv_fid'],
          '@sid' => $data['submission_id'] ?? 'unknown',
        ]);
      }
    }

    // The submission UUID flows through the payload as submission_id —
    // radar uses it as an idempotency key so a re-delivery (after this
    // worker retries) doesn't create a duplicate candidature.
    $payload = $data['payload'] ?? [];
    if (!empty($data['submission_id'])) {
      $payload['submission_id'] = $data['submission_id'];
    }

    try {
      $result = $this->client->sendCandidature($payload, $cv_path, $cv_filename);
      $this->logger->info('Queued candidature delivered to Skill Radar: submission=@sid candidature=@cid duplicate=@dup', [
        '@sid' => $data['submission_id'] ?? '(none)',
        '@cid' => $result['candidatureId'] ?? 'unknown',
        '@dup' => !empty($result['duplicate']) ? 'yes' : 'no',
      ]);
    }
    catch (ConnectException $e) {
      // Radar pod down / network partition / DNS fail. Stop draining this
      // run so we don't hammer a dead endpoint; retry next cron cycle.
      $this->logger->warning('Skill Radar unreachable, suspending queue: @msg', ['@msg' => $e->getMessage()]);
      throw new SuspendQueueException($e->getMessage(), 0, $e);
    }
    catch (ServerException $e) {
      // Radar returned 5xx — probably overloaded or mid-deploy. Same as above.
      $this->logger->warning('Skill Radar returned 5xx, suspending queue: @msg', ['@msg' => $e->getMessage()]);
      throw new SuspendQueueException($e->getMessage(), 0, $e);
    }
    catch (\Exception $e) {
      // Any other error (4xx, logic bug) — log loudly and let Drupal
      // re-queue. If it's a genuine bad-request, it'll fail forever and
      // someone will notice from the logs; better than silently losing it.
      $this->logger->error('Skill Radar delivery failed (will retry): submission=@sid @msg', [
        '@sid' => $data['submission_id'] ?? '(none)',
        '@msg' => $e->getMessage(),
      ]);
      throw $e;
    }
  }

}
