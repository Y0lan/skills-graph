<?php

namespace Drupal\sinapse_webhook;

use Drupal\Core\Config\ConfigFactoryInterface;
use Drupal\Core\Logger\LoggerChannelFactoryInterface;
use GuzzleHttp\ClientInterface;
use GuzzleHttp\Psr7\MultipartStream;
use GuzzleHttp\Psr7\Request;

/**
 * Client for sending candidature data to the Skill Radar API.
 */
class SkillRadarClient {

  protected ClientInterface $httpClient;
  protected ConfigFactoryInterface $configFactory;
  protected $logger;

  public function __construct(
    ClientInterface $http_client,
    ConfigFactoryInterface $config_factory,
    LoggerChannelFactoryInterface $logger_factory,
  ) {
    $this->httpClient = $http_client;
    $this->configFactory = $config_factory;
    $this->logger = $logger_factory->get('sinapse_webhook');
  }

  /**
   * Send a candidature to Skill Radar's intake endpoint.
   *
   * @param array $data
   *   Associative array with keys: nom, prenom, email, poste_vise,
   *   telephone, linkedin, github, message, canal.
   * @param string|null $cv_path
   *   Absolute path to the CV file on disk, or NULL.
   * @param string|null $cv_filename
   *   Original filename of the CV.
   *
   * @return array
   *   Response from the API: ['ok' => bool, 'candidatureId' => string, ...]
   *
   * @throws \Exception
   */
  public function sendCandidature(array $data, ?string $cv_path = NULL, ?string $cv_filename = NULL): array {
    $config = $this->configFactory->get('sinapse_webhook.settings');
    $api_url = rtrim($config->get('api_url'), '/');
    $secret = $config->get('webhook_secret');

    if (empty($api_url)) {
      throw new \RuntimeException('Skill Radar API URL not configured');
    }

    $url = $api_url . '/api/recruitment/intake';

    // Build multipart form if CV is present, otherwise JSON
    if ($cv_path && file_exists($cv_path)) {
      $multipart = [];
      foreach ($data as $key => $value) {
        if ($value !== NULL && $value !== '') {
          $multipart[] = [
            'name' => $key,
            'contents' => (string) $value,
          ];
        }
      }
      $multipart[] = [
        'name' => 'cv',
        'contents' => fopen($cv_path, 'r'),
        'filename' => $cv_filename ?? basename($cv_path),
      ];

      $response = $this->httpClient->request('POST', $url, [
        'multipart' => $multipart,
        'headers' => $this->buildHeaders($secret, NULL),
        'timeout' => 60, // CV extraction can take time
      ]);
    }
    else {
      $response = $this->httpClient->request('POST', $url, [
        'json' => $data,
        'headers' => $this->buildHeaders($secret, 'application/json'),
        'timeout' => 30,
      ]);
    }

    $status = $response->getStatusCode();
    $body = json_decode($response->getBody()->getContents(), TRUE);

    if ($status >= 400) {
      $error = $body['error'] ?? 'Unknown error';
      $this->logger->error('Skill Radar intake failed: @status @error', [
        '@status' => $status,
        '@error' => $error,
      ]);
      throw new \RuntimeException("Skill Radar API error ($status): $error");
    }

    $this->logger->info('Candidature sent to Skill Radar: @id (updated: @updated)', [
      '@id' => $body['candidatureId'] ?? 'unknown',
      '@updated' => $body['updated'] ? 'yes' : 'no',
    ]);

    return $body;
  }

  /**
   * Build request headers with optional webhook secret.
   */
  protected function buildHeaders(?string $secret, ?string $content_type): array {
    $headers = [];
    if ($content_type) {
      $headers['Content-Type'] = $content_type;
    }
    if (!empty($secret)) {
      $headers['X-Webhook-Secret'] = $secret;
    }
    return $headers;
  }

}
