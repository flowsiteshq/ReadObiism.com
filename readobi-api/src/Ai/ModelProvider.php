<?php
/**
 * ALG Company - Model Provider Abstraction
 *
 * Single contract every AI inference backend must satisfy (Groq LPU, the
 * Miss Algorithm Python/FastAPI microservice, OpenAI, Gemini, ...). Call
 * sites depend on this interface so providers can be swapped behind the
 * AI_PROVIDER config knob without touching business logic.
 */

namespace Alg\Ai;

interface ModelProvider {

    /**
     * Provider identifier echoed in API responses and audit logs (e.g. 'groq', 'python').
     */
    public function name(): string;

    /**
     * Execute a chat completion with automatic model fallback where the
     * provider supports it.
     *
     * @param array $messages Array of ['role' => 'user'|'assistant'|'system', 'content' => '...']
     * @param array $options  Additional options (model, temperature, max_tokens, etc.)
     * @return array ['ok' => bool, 'content' => string, 'model' => string, 'usage' => array, 'error' => string]
     */
    public function chatCompletions(array $messages, array $options = []): array;

    /**
     * Single prompt generation helper.
     *
     * @param string $prompt       User prompt string
     * @param string|null $systemPrompt Optional system prompt
     * @param array $options       Additional options (model, temperature, max_tokens)
     * @return array
     */
    public function generate(string $prompt, ?string $systemPrompt = null, array $options = []): array;
}