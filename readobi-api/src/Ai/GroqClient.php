<?php
/**
 * ALG Company - Groq AI Inference Engine Client
 * 
 * Provides:
 * - High-speed LPU AI inference via Groq Cloud API (https://api.groq.com/openai/v1)
 * - Automatic candidate model fallback chain (handles model deprecations / 404s)
 * - Chat completions and single-prompt generation
 * - Configurable temperature, max_tokens, and system prompts
 * - Audit logging and execution metrics
 */

namespace Alg\Ai;

class GroqClient implements ModelProvider {
    protected $apiKey;
    protected $defaultModel;

    // Supported & Fallback Models Chain
    protected $candidateChain = [
        'llama-3.3-70b-versatile',
        'llama-3.1-8b-instant',
        'openai/gpt-oss-120b',
        'openai/gpt-oss-20b',
        'qwen/qwen3.6-27b',
        'groq/compound-mini',
        'mixtral-8x7b-32768'
    ];

    public function __construct(?string $apiKey = null, ?string $defaultModel = null) {
        $this->apiKey = $apiKey ?: $this->resolveApiKey();
        $this->defaultModel = $defaultModel ?: $this->resolveDefaultModel();
    }

    public function name(): string {
        return 'groq';
    }

    /**
     * Resolve Groq API Key from Config, Environment, or Database
     */
    protected function resolveApiKey(): string {
        $key = \Config::get('groq_api_key');
        if (!empty($key)) return trim((string)$key);

        $envKey = alg_env('GROQ_API_KEY', '');
        if (!empty($envKey)) return trim((string)$envKey);

        $db = getDbConnection();
        if ($db) {
            try {
                $stmt = $db->query("SELECT value FROM site_settings WHERE setting_key IN ('groq_api_key', 'groq_key') LIMIT 1");
                $val = $stmt->fetchColumn();
                if ($val) return trim((string)$val);
            } catch (\PDOException $e) {}
        }

        return '';
    }

    /**
     * Resolve primary Groq model name
     */
    protected function resolveDefaultModel(): string {
        $model = \Config::get('groq_model');
        if (!empty($model)) return trim((string)$model);

        $envModel = alg_env('GROQ_MODEL', '');
        if (!empty($envModel)) return trim((string)$envModel);

        return 'llama-3.3-70b-versatile';
    }

    /**
     * Build candidate model fallback chain
     */
    public function getCandidateModels(string $primary): array {
        $models = [$primary];
        foreach ($this->candidateChain as $candidate) {
            if ($candidate !== $primary && !in_array($candidate, $models, true)) {
                $models[] = $candidate;
            }
        }
        return $models;
    }

    /**
     * Execute Chat Completion request with automatic model fallback
     * 
     * @param array $messages Array of ['role' => 'user'|'assistant'|'system', 'content' => '...']
     * @param array $options Additional options (model, temperature, max_tokens, etc.)
     * @return array ['ok' => bool, 'content' => string, 'model' => string, 'usage' => array, 'error' => string]
     */
    public function chatCompletions(array $messages, array $options = []): array {
        if (empty($this->apiKey)) {
            return [
                'ok'    => false,
                'error' => 'GROQ_API_KEY is not configured in .env or site_settings.'
            ];
        }

        $primaryModel = $options['model'] ?? $this->defaultModel;
        $candidateModels = $this->getCandidateModels($primaryModel);
        $lastError = 'Unknown Groq API error.';

        foreach ($candidateModels as $targetModel) {
            $payload = [
                'model'       => $targetModel,
                'messages'    => $messages,
                'temperature' => isset($options['temperature']) ? (float)$options['temperature'] : 0.4,
                'max_tokens'  => isset($options['max_tokens']) ? (int)$options['max_tokens'] : 1024,
                'stream'      => false
            ];

            $ch = curl_init('https://api.groq.com/openai/v1/chat/completions');
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_POST           => true,
                CURLOPT_HTTPHEADER     => [
                    'Content-Type: application/json',
                    'Authorization: Bearer ' . $this->apiKey,
                ],
                CURLOPT_POSTFIELDS     => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                CURLOPT_TIMEOUT        => 30,
                CURLOPT_SSL_VERIFYPEER => true
            ]);

            $rawResponse = curl_exec($ch);
            $curlError = curl_error($ch);
            $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if ($rawResponse === false) {
                $lastError = "Groq cURL error: " . ($curlError ?: 'Connection failed');
                continue;
            }

            $decoded = json_decode($rawResponse, true);
            if (!is_array($decoded)) {
                $lastError = "Invalid JSON response from Groq API (HTTP {$httpCode})";
                continue;
            }

            // Check non-2xx responses
            if ($httpCode < 200 || $httpCode >= 300) {
                $msg = (string)($decoded['error']['message'] ?? $decoded['message'] ?? "Groq HTTP {$httpCode}");
                $lastError = $msg;

                // If model is decommissioned, deprecated, or not found, try next candidate model!
                $modelUnavailable = ($httpCode === 404)
                    || stripos($msg, 'decommission') !== false
                    || stripos($msg, 'not_found') !== false
                    || stripos($msg, 'does not exist') !== false
                    || stripos($msg, 'deprecated') !== false;

                if ($modelUnavailable) {
                    continue;
                }

                return [
                    'ok'    => false,
                    'error' => $lastError,
                    'http'  => $httpCode
                ];
            }

            $content = (string)($decoded['choices'][0]['message']['content'] ?? '');
            $usage = $decoded['usage'] ?? [
                'prompt_tokens'     => 0,
                'completion_tokens' => 0,
                'total_tokens'      => 0
            ];

            return [
                'ok'      => true,
                'content' => $content,
                'model'   => $targetModel,
                'usage'   => $usage,
                'raw'     => $decoded
            ];
        }

        return [
            'ok'    => false,
            'error' => "All candidate Groq models failed. Last error: {$lastError}"
        ];
    }

    /**
     * Single Prompt Generation Helper
     * 
     * @param string $prompt User prompt string
     * @param string|null $systemPrompt Optional system prompt
     * @param array $options Additional options (model, temperature, max_tokens)
     * @return array
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
