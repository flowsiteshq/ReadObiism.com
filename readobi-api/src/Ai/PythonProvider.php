<?php
/**
 * ALG Company - Miss Algorithm Python Microservice Client
 *
 * Talks to the dedicated FastAPI service (alg-school-os-ai) over the same
 * OpenAI-compatible chat/completions contract Groq uses, so flipping
 * AI_PROVIDER=python keeps every PHP call site untouched.
 *
 * Dev default: http://127.0.0.1:8000 bound to the loopback interface.
 */

namespace Alg\Ai;

class PythonProvider implements ModelProvider {
    protected $baseUrl;
    protected $apiToken;
    protected $defaultModel;

    public function __construct(?string $baseUrl = null, ?string $apiToken = null, ?string $defaultModel = null) {
        $this->baseUrl = rtrim((string)($baseUrl ?: $this->resolveBaseUrl()), '/');
        $this->apiToken = $apiToken !== null ? (string)$apiToken : $this->resolveApiToken();
        $this->defaultModel = $defaultModel ?: $this->resolveDefaultModel();
    }

    public function name(): string {
        return 'python';
    }

    protected function resolveBaseUrl(): string {
        $config = \Config::get('python_ai_base_url');
        if (!empty($config)) return (string)$config;

        $env = alg_env('PYTHON_AI_BASE_URL', '');
        return !empty($env) ? (string)$env : 'http://127.0.0.1:8000';
    }

    protected function resolveApiToken(): string {
        $config = \Config::get('python_ai_token');
        if ($config !== null && $config !== '') return trim((string)$config);

        $env = alg_env('PYTHON_AI_TOKEN', '');
        return $env ? trim((string)$env) : '';
    }

    protected function resolveDefaultModel(): string {
        $config = \Config::get('python_ai_model');
        if (!empty($config)) return trim((string)$config);

        $env = alg_env('PYTHON_AI_MODEL', '');
        return $env ? trim((string)$env) : 'miss-algorithm-v1';
    }

    protected function getEndpoint(): string {
        return $this->baseUrl . '/v1/chat/completions';
    }

    /**
     * @inheritdoc
     */
    public function chatCompletions(array $messages, array $options = []): array {
        if ($this->baseUrl === '') {
            return [
                'ok'    => false,
                'error' => 'PYTHON_AI_BASE_URL is not configured in .env.'
            ];
        }

        $payload = [
            'model'       => $options['model'] ?? $this->defaultModel,
            'messages'    => $messages,
            'temperature' => isset($options['temperature']) ? (float)$options['temperature'] : 0.4,
            'max_tokens'  => isset($options['max_tokens']) ? (int)$options['max_tokens'] : 1024,
            'stream'      => false
        ];

        $headers = ['Content-Type: application/json'];
        if ($this->apiToken !== '') {
            $headers[] = 'Authorization: Bearer ' . $this->apiToken;
        }

        $ch = curl_init($this->getEndpoint());
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_POSTFIELDS     => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            CURLOPT_TIMEOUT        => 60,
            CURLOPT_SSL_VERIFYPEER => true
        ]);

        $rawResponse = curl_exec($ch);
        $curlError = curl_error($ch);
        $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($rawResponse === false) {
            return [
                'ok'    => false,
                'error' => "Python AI cURL error: " . ($curlError ?: 'Connection failed — is the Miss Algorithm service running on ' . $this->baseUrl . '?')
            ];
        }

        $decoded = json_decode($rawResponse, true);
        if (!is_array($decoded)) {
            return [
                'ok'    => false,
                'error' => "Invalid JSON response from Python AI (HTTP {$httpCode})"
            ];
        }

        if ($httpCode < 200 || $httpCode >= 300) {
            return [
                'ok'    => false,
                'error' => (string)($decoded['error']['message'] ?? $decoded['error'] ?? $decoded['detail'] ?? "Python AI HTTP {$httpCode}"),
                'http'  => $httpCode
            ];
        }

        return [
            'ok'      => true,
            'content' => (string)($decoded['choices'][0]['message']['content'] ?? ''),
            'model'   => (string)($decoded['model'] ?? $payload['model']),
            'usage'   => $decoded['usage'] ?? [
                'prompt_tokens'     => 0,
                'completion_tokens' => 0,
                'total_tokens'      => 0
            ],
            'raw'     => $decoded
        ];
    }

    /**
     * @inheritdoc
     */
    public function generate(string $prompt, ?string $systemPrompt = null, array $options = []): array {
        $messages = [];
        if (!empty($systemPrompt)) {
            $messages[] = ['role' => 'system', 'content' => $systemPrompt];
        }
        $messages[] = ['role' => 'user', 'content' => $prompt];

        return $this->chatCompletions($messages, $options);
    }
}