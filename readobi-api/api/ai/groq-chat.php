<?php
/**
 * AI Module - Groq Conversational Chat Completions Endpoint
 * POST /api/ai/groq-chat.php
 * 
 * Supports:
 * - Multi-turn conversational messages array
 * - High-speed Groq LPU inference (llama-3.3-70b-versatile, llama-3.1-8b-instant, etc.)
 * - Automatic candidate model fallback chain
 * - Rate limiting and audit logging
 */

require_once __DIR__ . '/../../config.php';

$user = verifyAuthToken();

// Rate limiting: Max 30 Groq chat queries per minute per user
\Alg\Security\RateLimiter::check('groq_chat', 30, 60);

$input = getJsonInput();

$messages = $input['messages'] ?? [];
$model = trim($input['model'] ?? Config::get('groq_model', 'llama-3.3-70b-versatile'));
$temperature = isset($input['temperature']) ? (float)$input['temperature'] : 0.4;
$maxTokens = isset($input['max_tokens']) ? (int)$input['max_tokens'] : 1024;

if (empty($messages) || !is_array($messages)) {
    sendError("A non-empty 'messages' array is required. Example: [{'role': 'user', 'content': 'Hello!'}]", 400);
}

$groq = new \Alg\Ai\GroqClient();
$result = $groq->chatCompletions($messages, [
    'model'       => $model,
    'temperature' => $temperature,
    'max_tokens'  => $maxTokens
]);

if ($result['ok']) {
    \Alg\Audit\AuditLogger::log('ai.groq_chat', 'ai', null, null, [
        'model'        => $result['model'],
        'total_tokens' => $result['usage']['total_tokens'] ?? 0
    ], (int)($user['id'] ?? 1), (int)($user['org_id'] ?? 1));

    sendSuccess([
        'provider' => 'groq',
        'model'    => $result['model'],
        'message'  => [
            'role'    => 'assistant',
            'content' => $result['content']
        ],
        'usage'    => $result['usage']
    ], "Groq chat response completed successfully.");
}

// Development fallback if key not configured
if (strpos($result['error'] ?? '', 'GROQ_API_KEY is not configured') !== false) {
    $lastUserMsg = '';
    foreach (array_reverse($messages) as $m) {
        if (($m['role'] ?? '') === 'user') {
            $lastUserMsg = $m['content'] ?? '';
            break;
        }
    }

    $mockReply = "Groq Assistant (Development Mode): Received query '{$lastUserMsg}'. To connect live ultra-fast LPU inference, add your GROQ_API_KEY to .env.";

    sendSuccess([
        'provider' => 'groq',
        'model'    => $model,
        'message'  => [
            'role'    => 'assistant',
            'content' => $mockReply
        ],
        'usage'    => [
            'prompt_tokens'     => 15,
            'completion_tokens' => 25,
            'total_tokens'      => 40
        ]
    ], "Groq response returned (development mode).");
}

sendError("Groq AI Chat Error: " . ($result['error'] ?? 'Unknown error occurred'), 502);
