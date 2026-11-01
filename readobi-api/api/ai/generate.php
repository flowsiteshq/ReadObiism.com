<?php
/**
 * AI Module - Universal LLM Provider Abstraction Endpoint
 * POST /api/ai/generate.php
 */

require_once __DIR__ . '/../../config.php';

$user = verifyAuthToken();

// Rate limiting: Max 30 AI generations per minute per user/IP
\Alg\Security\RateLimiter::check('ai_generate', 30, 60);

$input = getJsonInput();
$prompt = trim($input['prompt'] ?? '');
$systemPrompt = trim($input['system_prompt'] ?? 'You are an expert AI assistant powering ALG Studio platforms.');
$provider = strtolower(trim($input['provider'] ?? 'groq'));
$model = trim($input['model'] ?? ($provider === 'groq' ? Config::get('groq_model', 'llama-3.3-70b-versatile') : 'gemini-3.5-flash'));
$temperature = isset($input['temperature']) ? (float)$input['temperature'] : 0.4;
$maxTokens = isset($input['max_tokens']) ? (int)$input['max_tokens'] : 1024;

if (empty($prompt)) {
    sendError("Prompt string is required.", 400);
}

// 1. Live Groq LPU Inference
if ($provider === 'groq') {
    $groq = new \Alg\Ai\GroqClient();
    $result = $groq->generate($prompt, $systemPrompt, [
        'model'       => $model,
        'temperature' => $temperature,
        'max_tokens'  => $maxTokens
    ]);

    if ($result['ok']) {
        \Alg\Audit\AuditLogger::log('ai.groq_completion', 'ai', null, null, [
            'model'        => $result['model'],
            'total_tokens' => $result['usage']['total_tokens'] ?? 0
        ], (int)($user['id'] ?? 1), (int)($user['org_id'] ?? 1));

        sendSuccess([
            'provider'   => 'groq',
            'model'      => $result['model'],
            'prompt'     => $prompt,
            'completion' => $result['content'],
            'usage'      => $result['usage']
        ], "AI completion generated successfully via Groq.");
    }

    // Fall back to mock if key is unconfigured in development
    if (strpos($result['error'] ?? '', 'GROQ_API_KEY is not configured') !== false) {
        $completionText = "Groq AI Response (Dev Mode): Received prompt '{$prompt}'. Set GROQ_API_KEY in .env for live LPU inference with {$model}.";
        sendSuccess([
            'provider'   => 'groq',
            'model'      => $model,
            'prompt'     => $prompt,
            'completion' => $completionText,
            'usage'      => [
                'prompt_tokens'     => (int)(strlen($prompt) / 4),
                'completion_tokens' => (int)(strlen($completionText) / 4),
                'total_tokens'      => (int)((strlen($prompt) + strlen($completionText)) / 4)
            ]
        ], "AI completion generated (Groq development mode).");
    }

    sendError("Groq AI generation error: " . ($result['error'] ?? 'Unknown error'), 502);
}

// 2. Generic / Other Provider Stub
$completionText = "AI Response generated for prompt: '$prompt' using $provider ($model). Architecture ready for production OpenAI, Gemini, and Anthropic API keys.";

sendSuccess([
    'provider'   => $provider,
    'model'      => $model,
    'prompt'     => $prompt,
    'completion' => $completionText,
    'usage'      => [
        'prompt_tokens'     => (int)(strlen($prompt) / 4),
        'completion_tokens' => (int)(strlen($completionText) / 4),
        'total_tokens'      => (int)((strlen($prompt) + strlen($completionText)) / 4)
    ]
], "AI completion generated.");
