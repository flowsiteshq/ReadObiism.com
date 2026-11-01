<?php
/**
 * ALG Company - Model Provider Factory
 *
 * Resolves the active \Alg\Ai\ModelProvider from the AI_PROVIDER config
 * knob. Defaults to Groq so existing deployments are unaffected until
 * AI_PROVIDER=python is flipped in .env.
 */

namespace Alg\Ai;

final class ProviderFactory {

    public static function create(?string $provider = null): ModelProvider {
        $provider = strtolower(trim((string)($provider ?: \Config::get('ai_provider', 'groq'))));

        if ($provider === 'python') {
            return new PythonProvider();
        }

        return new GroqClient();
    }
}