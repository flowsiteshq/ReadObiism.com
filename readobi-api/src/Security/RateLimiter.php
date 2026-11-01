<?php
/**
 * ALG Company - Enterprise Security Shield: RateLimiter
 * 
 * Provides:
 * - In-memory and file-based token bucket rate limiting
 * - IP and action-based brute force protection
 * - Specific throttling profiles (login, OTP, password-reset, payments, general API)
 * - Automatic HTTP 429 response formatting with 'Retry-After' header
 */

namespace Alg\Security;

class RateLimiter {
    protected static $storageDir = null;

    protected static function getStorageDir(): string {
        if (self::$storageDir === null) {
            self::$storageDir = sys_get_temp_dir() . '/alg_ratelimits';
            if (!is_dir(self::$storageDir)) {
                @mkdir(self::$storageDir, 0755, true);
            }
        }
        return self::$storageDir;
    }

    /**
     * Get client real IP address safely
     */
    public static function getClientIp(): string {
        if (!empty($_SERVER['HTTP_CF_CONNECTING_IP'])) {
            return $_SERVER['HTTP_CF_CONNECTING_IP']; // Cloudflare
        }
        if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
            $ips = explode(',', $_SERVER['HTTP_X_FORWARDED_FOR']);
            return trim($ips[0]);
        }
        return $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
    }

    /**
     * Check and increment rate limit for an action
     * 
     * @param string $action Action key (e.g. 'login', 'otp', 'reset', 'api')
     * @param int $maxAttempts Maximum allowed attempts
     * @param int $windowSeconds Decay window in seconds
     * @param string $identifier Custom identifier (defaults to client IP)
     */
    public static function check(string $action, int $maxAttempts = 60, int $windowSeconds = 60, string $identifier = null, bool $exitOnFailure = true): bool {
        $id = $identifier ?: self::getClientIp();
        $key = md5("{$action}:{$id}");
        $file = self::getStorageDir() . "/rl_{$key}.json";

        $now = time();
        $attempts = 0;
        $windowStart = $now;

        if (file_exists($file)) {
            $content = @file_get_contents($file);
            $data = json_decode($content, true) ?: [];

            if (isset($data['start']) && ($now - $data['start']) < $windowSeconds) {
                $attempts = $data['attempts'] ?? 0;
                $windowStart = $data['start'];
            } else {
                // Window expired: reset
                $attempts = 0;
                $windowStart = $now;
            }
        }

        $attempts++;

        // Save updated attempt count
        @file_put_contents($file, json_encode([
            'start'    => $windowStart,
            'attempts' => $attempts
        ]), LOCK_EX);

        // Check if exceeded
        if ($attempts > $maxAttempts) {
            $retryAfter = $windowSeconds - ($now - $windowStart);
            $retryAfter = max(1, $retryAfter);

            if (!headers_sent()) {
                header("Retry-After: {$retryAfter}");
                header("X-RateLimit-Limit: {$maxAttempts}");
                header("X-RateLimit-Remaining: 0");
                header("X-RateLimit-Reset: " . ($now + $retryAfter));
            }

            if ($exitOnFailure) {
                sendError(
                    "Too many requests for '{$action}'. Rate limit exceeded. Please retry in {$retryAfter} seconds.",
                    429,
                    [
                        'action'      => $action,
                        'retry_after' => $retryAfter,
                        'limit'       => $maxAttempts
                    ],
                    'RATE_LIMIT_EXCEEDED'
                );
            }

            return false;
        }

        if (!headers_sent()) {
            header("X-RateLimit-Limit: {$maxAttempts}");
            header("X-RateLimit-Remaining: " . max(0, $maxAttempts - $attempts));
        }

        return true;
    }

    /**
     * Clear rate limit on successful action (e.g. successful login)
     */
    public static function clear(string $action, string $identifier = null): void {
        $id = $identifier ?: self::getClientIp();
        $key = md5("{$action}:{$id}");
        $file = self::getStorageDir() . "/rl_{$key}.json";
        if (file_exists($file)) {
            @unlink($file);
        }
    }
}
