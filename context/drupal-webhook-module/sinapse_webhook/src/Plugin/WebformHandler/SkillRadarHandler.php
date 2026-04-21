<?php

namespace Drupal\sinapse_webhook\Plugin\WebformHandler;

use Drupal\Core\Form\FormStateInterface;
use Drupal\webform\Plugin\WebformHandlerBase;
use Drupal\webform\WebformSubmissionInterface;
use Symfony\Component\DependencyInjection\ContainerInterface;

/**
 * Webform handler that forwards 'postuler' submissions to Skill Radar.
 *
 * @WebformHandler(
 *   id = "skill_radar_intake",
 *   label = @Translation("Skill Radar Intake"),
 *   category = @Translation("SINAPSE"),
 *   description = @Translation("Envoie les candidatures au Skill Radar pour suivi et scoring automatique."),
 *   cardinality = \Drupal\webform\Plugin\WebformHandlerInterface::CARDINALITY_SINGLE,
 *   results = \Drupal\webform\Plugin\WebformHandlerInterface::RESULTS_PROCESSED,
 * )
 */
class SkillRadarHandler extends WebformHandlerBase {

  protected $skillRadarClient;
  protected $configFactory;

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container, array $configuration, $plugin_id, $plugin_definition) {
    $instance = parent::create($container, $configuration, $plugin_id, $plugin_definition);
    $instance->skillRadarClient = $container->get('sinapse_webhook.skill_radar_client');
    $instance->configFactory = $container->get('config.factory');
    return $instance;
  }

  /**
   * {@inheritdoc}
   */
  public function postSave(WebformSubmissionInterface $webform_submission, $update = TRUE) {
    // Only process completed submissions (not drafts)
    if ($webform_submission->isDraft()) {
      return;
    }

    $data = $webform_submission->getData();
    $config = $this->configFactory->get('sinapse_webhook.settings');

    // Map Drupal taxonomy term ID to Skill Radar poste ID
    $poste_mapping = $config->get('poste_mapping') ?? [];
    $drupal_poste_id = $data['poste_vise'] ?? '';
    $skill_radar_poste_id = $poste_mapping[$drupal_poste_id] ?? NULL;

    if (!$skill_radar_poste_id) {
      $this->getLogger()->warning('No Skill Radar poste mapping for Drupal term ID: @id', [
        '@id' => $drupal_poste_id,
      ]);
      // Still send, let the API return an error if poste is invalid
      $skill_radar_poste_id = $drupal_poste_id;
    }

    // Build the payload matching Skill Radar's intake schema
    $payload = [
      'nom' => $data['nom'] ?? '',
      'prenom' => $data['prenom'] ?? '',
      'email' => $data['email'] ?? '',
      'poste_vise' => $skill_radar_poste_id,
      'linkedin' => $data['linkedin'] ?? '',
      'github' => $data['github'] ?? '',
      'message' => $data['message'] ?? '',
      'canal' => 'site', // All Drupal submissions are from sinapse.nc
    ];

    // Resolve CV file path (Drupal stores file IDs, not paths)
    $cv_path = NULL;
    $cv_filename = NULL;
    $cv_fid = $data['cv'] ?? NULL;
    if ($cv_fid) {
      $file = \Drupal\file\Entity\File::load($cv_fid);
      if ($file) {
        $cv_path = \Drupal::service('file_system')->realpath($file->getFileUri());
        $cv_filename = $file->getFilename();
      }
    }

    // Enqueue for durable delivery to Skill Radar.
    //
    // Before: postSave made a synchronous HTTP POST. If radar was down,
    // the log line was the only trace — candidature was effectively lost.
    //
    // Now: we push the payload + file reference into Drupal's DB-backed
    // queue. SkillRadarSendWorker pulls it on cron (tuned to 60s via a
    // K8s CronJob hitting /cron/<key>), retries on 5xx / network errors
    // via SuspendQueueException. Zero data loss even if radar is down
    // for hours — the webform submission row in Drupal is authoritative,
    // and the queue item is its envelope until delivery succeeds.
    try {
      $queue = \Drupal::queue('sinapse_webhook_send');
      $queue->createItem([
        'submission_id' => $webform_submission->uuid(),
        'payload' => $payload,
        'cv_fid' => $cv_fid,
        'cv_filename' => $cv_filename,
      ]);
      $this->getLogger()->info('Candidature queued for Skill Radar: submission=@sid uuid=@uuid', [
        '@sid' => $webform_submission->id(),
        '@uuid' => $webform_submission->uuid(),
      ]);
    }
    catch (\Exception $e) {
      // The queue itself failing is a database-level error (extremely
      // rare). Log and continue — the Webform submission row is already
      // saved, so an ops person can manually re-queue from the UI.
      $this->getLogger()->error('Failed to queue candidature for Skill Radar: @msg (submission @sid)', [
        '@msg' => $e->getMessage(),
        '@sid' => $webform_submission->id(),
      ]);
    }
  }

}
