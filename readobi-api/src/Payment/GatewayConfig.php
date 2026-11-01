<?php
/**
 * ALG School OS - Platform Gateway Config
 *
 * Single source of truth for the MASTER payment-gateway credentials.
 *
 * Resolution order for every credential:
 *   1. `platform_gateway_configs` row for the provider (set by a product admin
 *      from Dashboard -> Settings -> Payment Gateways, encrypted at rest)
 *   2. `.env` value (deployment-level fallback / bootstrapping)
 *
 * Schools never read this class; only platform admins can write to it, and
 * secrets are never returned to the browser in clear text.
 *
 * Storage: AES-256-CBC, key derived with SHA-256 from ENCRYPTION_KEY
 * (falls back to JWT_SECRET so a fresh install still works, but a dedicated
 * ENCRYPTION_KEY is strongly recommended).
 */

namespace Alg\Payment;

class GatewayConfig
{
    /** Providers the platform knows how to talk to. */
    public const PROVIDERS = ['paystack', 'flutterwave', 'stripe', 'paypal', 'opay'];

    private const CIPHER = 'AES-256-CBC';

    /** @var array<string, array|null>|null Per-request cache */
    private static $cache = null;

    /** @var bool Guard so a missing table (pre-migration) does not spam queries */
    private static $tableAvailable = true;

    /* ------------------------------------------------------------------ */
    /* Encryption                                                          */
    /* ------------------------------------------------------------------ */

    private static function key(): string
    {
        $key = (string) alg_env('ENCRYPTION_KEY', '');
        if ($key === '') {
            $key = (string) alg_env('JWT_SECRET', 'alg_paysplit_default_key_change_me');
        }
        return hash('sha256', $key, true); // always 32 bytes -> valid AES-256 key
    }

    public static function encrypt(string $plain): string
    {
        if ($plain === '') {
            return '';
        }
        $ivLength = openssl_cipher_iv_length(self::CIPHER);
        $iv = random_bytes($ivLength);
        $cipherText = openssl_encrypt($plain, self::CIPHER, self::key(), OPENSSL_RAW_DATA, $iv);
        return base64_encode($iv . $cipherText);
    }

    public static function decrypt(?string $stored): ?string
    {
        if ($stored === null || $stored === '') {
            return null;
        }
        $raw = base64_decode($stored, true);
        if ($raw === false) {
            return null; // stored before encryption was introduced
        }
        $ivLength = openssl_cipher_iv_length(self::CIPHER);
        if (strlen($raw) <= $ivLength) {
            return null;
        }
        $iv = substr($raw, 0, $ivLength);
        $cipherText = substr($raw, $ivLength);
        $plain = openssl_decrypt($cipherText, self::CIPHER, self::key(), OPENSSL_RAW_DATA, $iv);
        return $plain === false ? null : $plain;
    }

    /* ------------------------------------------------------------------ */
    /* Reads                                                               */
    /* ------------------------------------------------------------------ */

    /**
     * Raw rows keyed by provider, secrets still encrypted.
     *
     * @return array<string, array>
     */
    public static function rows(): array
    {
        if (self::$cache !== null) {
            return self::$cache;
        }

        self::$cache = [];
        if (!self::$tableAvailable) {
            return self::$cache;
        }

        try {
            $db = getDbConnection();
            $stmt = $db->query("SELECT * FROM platform_gateway_configs ORDER BY provider");
            foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $row) {
                self::$cache[strtolower((string) $row['provider'])] = $row;
            }
        } catch (\Throwable $e) {
            // Table not migrated yet - degrade to .env resolution.
            self::$tableAvailable = false;
            self::$cache = [];
        }

        return self::$cache;
    }

    /** Forget the per-request cache (call after a write). */
    public static function flush(): void
    {
        self::$cache = null;
        self::$tableAvailable = true;
    }

    /**
     * Fully resolved (decrypted) configuration for a provider.
     *
     * @return array{provider:string,source:string,mode:string,public_key:string,secret_key:string,webhook_secret:string,enabled:bool,last_tested:?string,last_test_ok:?bool,last_test_message:?string}
     */
    public static function get(string $provider): array
    {
        $provider = strtolower(trim($provider));
        $rows = self::rows();
        $row = $rows[$provider] ?? null;

        [$envPublic, $envSecret, $envWebhook] = self::envKeys($provider);

        $dbSecret = $row ? (self::decrypt($row['secret_key']) ?: '') : '';
        $dbWebhook = $row ? (self::decrypt($row['webhook_secret']) ?: '') : '';

        if ($dbSecret !== '') {
            $source = 'platform';
        } elseif ($envSecret !== '') {
            $source = 'env';
        } else {
            $source = 'none';
        }

        $mode = $row['mode'] ?? (alg_env(strtoupper($provider) . '_MODE', 'test') ?: 'test');

        return [
            'provider'          => $provider,
            'source'            => $source,
            'mode'              => $mode === 'live' ? 'live' : 'test',
            'public_key'        => (string) ($row['public_key'] ?? '') !== '' ? (string) $row['public_key'] : $envPublic,
            'secret_key'        => $dbSecret !== '' ? $dbSecret : $envSecret,
            'webhook_secret'    => $dbWebhook !== '' ? $dbWebhook : $envWebhook,
            'extra'             => self::decodeExtra($row['extra_config'] ?? null),
            'enabled'           => $row ? (bool) $row['enabled'] : ($source !== 'none'),
            'last_tested'       => $row['last_tested'] ?? null,
            'last_test_ok'      => isset($row['last_test_ok']) ? (bool) $row['last_test_ok'] : null,
            'last_test_message' => $row['last_test_message'] ?? null,
        ];
    }

    /** Is the provider usable for checkout right now? */
    public static function isConfigured(string $provider): bool
    {
        $conf = self::get($provider);
        return $conf['enabled'] && $conf['secret_key'] !== '';
    }

    public static function isEnabled(string $provider): bool
    {
        return !empty(self::get($provider)['enabled']);
    }

    public static function secret(string $provider): string
    {
        return self::get($provider)['secret_key'];
    }

    public static function publicKey(string $provider): string
    {
        return self::get($provider)['public_key'];
    }

    /** Webhook signing material; falls back to the secret key where gateways do that. */
    public static function webhookSecret(string $provider): string
    {
        $conf = self::get($provider);
        return $conf['webhook_secret'] !== '' ? $conf['webhook_secret'] : $conf['secret_key'];
    }

    public static function mode(string $provider): string
    {
        return self::get($provider)['mode'];
    }

    /** Provider-specific non-secret field (e.g. OPay merchant_id), with .env fallback. */
    public static function extra(string $provider, string $key, ?string $default = null): ?string
    {
        $extra = self::get($provider)['extra'] ?? [];
        if (!empty($extra[$key])) {
            return (string) $extra[$key];
        }
        $envKey = strtoupper($provider) . '_' . strtoupper($key);
        $env = alg_env($envKey, null);
        return $env !== null && $env !== '' ? (string) $env : $default;
    }

    /** Providers that can accept a payment right now. */
    public static function enabledProviders(): array
    {
        $enabled = [];
        foreach (self::PROVIDERS as $provider) {
            if (self::isConfigured($provider)) {
                $enabled[] = $provider;
            }
        }
        return $enabled;
    }

    /* ------------------------------------------------------------------ */
    /* Writes                                                              */
    /* ------------------------------------------------------------------ */

    /**
     * Create or update a provider configuration.
     *
     * Omitting `secret_key` / `webhook_secret` keeps the stored value, so an
     * admin can flip mode or rotate the public key without re-entering secrets.
     */
    public static function save(array $input, ?int $userId = null): array
    {
        $provider = strtolower(trim((string) ($input['provider'] ?? $input['gateway'] ?? '')));
        if (!in_array($provider, self::PROVIDERS, true)) {
            throw new \InvalidArgumentException('Unsupported gateway provider: ' . $provider);
        }

        $mode = strtolower((string) ($input['mode'] ?? 'test')) === 'live' ? 'live' : 'test';
        $publicKey = trim((string) ($input['public_key'] ?? ''));
        $secretKey = (string) ($input['secret_key'] ?? '');
        $webhookSecret = (string) ($input['webhook_secret'] ?? '');
        $enabled = array_key_exists('enabled', $input) ? (int) (bool) $input['enabled'] : 1;

        $existing = self::rows()[$provider] ?? null;

        // Non-secret, provider-specific values (e.g. OPay merchant_id). Empty
        // strings are dropped so an admin can clear a single field.
        $extra = [];
        if (isset($input['extra']) && is_array($input['extra'])) {
            foreach ($input['extra'] as $k => $v) {
                $k = preg_replace('/[^a-z0-9_]/i', '_', (string) $k);
                if ($k === '' || is_array($v)) {
                    continue;
                }
                $v = trim((string) $v);
                if ($v !== '') {
                    $extra[$k] = $v;
                }
            }
        }
        if ($extra === [] && $existing) {
            $extra = self::decodeExtra($existing['extra_config'] ?? null);
        }

        if ($secretKey === '' && !$existing) {
            throw new \InvalidArgumentException('secret_key is required the first time a gateway is configured.');
        }
        if ($publicKey === '' && !$existing) {
            throw new \InvalidArgumentException('public_key is required the first time a gateway is configured.');
        }

        $db = getDbConnection();
        $stmt = $db->prepare(
            "INSERT INTO platform_gateway_configs
                (provider, mode, public_key, secret_key, webhook_secret, extra_config, enabled, created_by, created_at, updated_at)
             VALUES
                (:provider, :mode, :public_key, :secret_key, :webhook_secret, :extra_config, :enabled, :created_by, NOW(), NOW())
             ON DUPLICATE KEY UPDATE
                mode = VALUES(mode),
                public_key = VALUES(public_key),
                secret_key = VALUES(secret_key),
                webhook_secret = VALUES(webhook_secret),
                extra_config = VALUES(extra_config),
                enabled = VALUES(enabled),
                updated_at = NOW()"
        );

        $stmt->execute([
            ':provider'       => $provider,
            ':mode'           => $mode,
            ':public_key'     => $publicKey !== '' ? $publicKey : (string) ($existing['public_key'] ?? ''),
            ':secret_key'     => $secretKey !== '' ? self::encrypt($secretKey) : (string) ($existing['secret_key'] ?? ''),
            ':webhook_secret' => $webhookSecret !== '' ? self::encrypt($webhookSecret) : (string) ($existing['webhook_secret'] ?? ''),
            ':extra_config'   => $extra !== [] ? json_encode($extra) : null,
            ':enabled'        => $enabled,
            ':created_by'     => $userId,
        ]);

        self::flush();
        return self::get($provider);
    }

    public static function remove(string $provider): void
    {
        $db = getDbConnection();
        $db->prepare("DELETE FROM platform_gateway_configs WHERE provider = :provider")
           ->execute([':provider' => strtolower(trim($provider))]);
        self::flush();
    }

    public static function markTested(string $provider, bool $ok, string $message = ''): void
    {
        try {
            $db = getDbConnection();
            $db->prepare(
                "UPDATE platform_gateway_configs
                    SET last_tested = NOW(), last_test_ok = :ok, last_test_message = :msg
                  WHERE provider = :provider"
            )->execute([
                ':ok'       => $ok ? 1 : 0,
                ':msg'      => mb_substr($message, 0, 255),
                ':provider' => strtolower(trim($provider)),
            ]);
        } catch (\Throwable $e) {
            // Testing is best-effort; never fail the request on telemetry.
        }
        self::flush();
    }

    /* ------------------------------------------------------------------ */
    /* Presentation helpers                                                */
    /* ------------------------------------------------------------------ */

    /** Mask a key for display, keeping a short recognisable prefix/suffix. */
    public static function mask(?string $value): string
    {
        $value = (string) $value;
        if ($value === '') {
            return '';
        }
        $len = strlen($value);
        if ($len <= 8) {
            return str_repeat('•', $len);
        }
        $prefixLen = strpos($value, '_') !== false ? min(8, (int) strpos($value, '_') + 1) : 3;
        return substr($value, 0, $prefixLen)
            . str_repeat('•', 8)
            . substr($value, -4);
    }

    /** Safe, browser-facing view of one provider (no plaintext secrets). */
    public static function toPublicArray(string $provider): array
    {
        $conf = self::get($provider);
        $maskedSecret = self::mask($conf['secret_key']);

        return [
            'provider'         => $conf['provider'],
            'mode'             => $conf['mode'],
            'enabled'          => $conf['enabled'],
            'configured'       => $conf['secret_key'] !== '',
            'source'           => $conf['source'],
            'public_key'       => $conf['public_key'],
            'public_key_masked'=> self::mask($conf['public_key']),
            'secret_key_masked'=> $maskedSecret,
            'has_webhook'      => $conf['webhook_secret'] !== '',
            'extra'            => $conf['extra'] ?? [],
            'last_tested'      => $conf['last_tested'],
            'last_test_ok'     => $conf['last_test_ok'],
            'last_test_message'=> $conf['last_test_message'],
        ];
    }

    /* ------------------------------------------------------------------ */
    /* Internals                                                           */
    /* ------------------------------------------------------------------ */

    /** @return array<string, string> */
    private static function decodeExtra($raw): array
    {
        if (is_array($raw)) {
            return $raw;
        }
        if (!is_string($raw) || $raw === '') {
            return [];
        }
        $decoded = json_decode($raw, true);
        return is_array($decoded) ? $decoded : [];
    }

    /**
     * .env fallback trio for a provider.
     *
     * @return array{0:string,1:string,2:string} [public, secret, webhook]
     */
    private static function envKeys(string $provider): array
    {
        switch ($provider) {
            case 'paystack':
                return [
                    (string) \Config::get('paystack_public', ''),
                    (string) \Config::get('paystack_secret', ''),
                    (string) alg_env('PAYSTACK_WEBHOOK_SECRET', \Config::get('paystack_secret', '')),
                ];
            case 'flutterwave':
                return [
                    (string) \Config::get('flutterwave_public', ''),
                    (string) \Config::get('flutterwave_secret', ''),
                    (string) \Config::get('flutterwave_webhook_secret', ''),
                ];
            case 'stripe':
                return [
                    (string) \Config::get('stripe_public', ''),
                    (string) \Config::get('stripe_secret', ''),
                    (string) \Config::get('stripe_webhook_secret', ''),
                ];
            case 'paypal':
                return [
                    (string) \Config::get('paypal_client_id', ''),
                    (string) \Config::get('paypal_client_secret', ''),
                    '',
                ];
            case 'opay':
                return [
                    (string) \Config::get('opay_public_key', ''),
                    (string) \Config::get('opay_private_key', ''),
                    '',
                ];
        }
        return ['', '', ''];
    }
}
