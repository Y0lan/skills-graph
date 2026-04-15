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

    // Send to Skill Radar (non-blocking: log errors but don't fail the form)
    try {
      $result = $this->skillRadarClient->sendCandidature($payload, $cv_path, $cv_filename);
      $this->getLogger()->info('Candidature forwarded to Skill Radar: submission @sid -> candidature @cid', [
        '@sid' => $webform_submission->id(),
        '@cid' => $result['candidatureId'] ?? 'unknown',
      ]);
    }
    catch (\Exception $e) {
      $this->getLogger()->error('Failed to forward candidature to Skill Radar: @msg (submission @sid)', [
        '@msg' => $e->getMessage(),
        '@sid' => $webform_submission->id(),
      ]);
      // Don't throw: the Drupal form submission should still succeed.
      // The candidature can be manually created in Skill Radar if the webhook fails.
    }
  }

}
