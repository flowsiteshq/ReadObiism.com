<?php
/**
 * ALG Company - Enterprise Core Configuration & Infrastructure Engine
 * 
 * Central configuration hub managing Database connection pooling, JWT auth,
 * multi-tenancy context, CORS, error handling, and environment validation.
 */

// 0. Environment File Loader (.env)
// The app reads configuration through alg_env(), so .env must be loaded here.
// Values are stored ONLY in the per-request superglobals ($_ENV / $_SERVER).
// We deliberately do NOT rely on putenv()/getenv(): Apache on Windows runs many
// threads inside a single process, and putenv() mutates a PROCESS-WIDE
// environment that is not thread-safe. Under a burst of concurrent requests that
// caused some requests to transiently read a key as missing, which made
// APP_ENV/JWT_SECRET fall back to their defaults. Per-request superglobals are
// isolated, so they are safe. Real host-provided variables (Apache SetEnv,
// php-fpm env, Docker --env) are already present in $_SERVER/$_ENV and win.
(function () {
    $path = __DIR__ . '/.env';

    // Robust read: the file can be momentarily locked / unavailable (antivirus,
    // indexing, editor save) under concurrent load, so retry briefly.
    $raw = false;
    for ($attempt = 0; $attempt < 5; $attempt++) {
        $raw = @file_get_contents($path);
        if (is_string($raw) && $raw !== '') break;
        usleep(20000); // 20ms backoff
    }
    if (!is_string($raw) || $raw === '') return;

    foreach (preg_split('/\r\n|\r|\n/', $raw) as $line) {
        $line = preg_replace('/^\xEF\xBB\xBF/', '', trim($line)); // strip UTF-8 BOM
        if ($line === '' || $line[0] === '#' || $line[0] === ';') continue;
        $eq = strpos($line, '=');
        if ($eq === false) continue;
        $key = trim(substr($line, 0, $eq));
        $val = trim(substr($line, $eq + 1));
        if ($key === '' || !preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $key)) continue;
        $len = strlen($val);
        if ($len >= 2 && (($val[0] === '"' && $val[$len - 1] === '"') || ($val[0] === "'" && $val[$len - 1] === "'"))) {
            $val = substr($val, 1, -1);                 // fully quoted value
        } elseif (($hash = strpos($val, ' #')) !== false) {
            $val = rtrim(substr($val, 0, $hash));       // trailing inline comment
        }
        if (isset($_ENV[$key]) || isset($_SERVER[$key])) continue; // host env wins
        $_ENV[$key] = $val;
        $_SERVER[$key] = $val;
    }
})();

// Thread-safe configuration reader. Prefers the per-request superglobals set by
// the loader above (and by Apache SetEnv), falling back to getenv() only for
// values that never passed through the loader.
if (!function_exists('alg_env')) {
    function alg_env($key, $default = null) {
        if (isset($_ENV[$key]) && $_ENV[$key] !== '') return $_ENV[$key];
        if (isset($_SERVER[$key]) && $_SERVER[$key] !== '') return $_SERVER[$key];
        $v = getenv($key);
        if ($v !== false && $v !== '') return $v;
        return $default;
    }
}

// 1. OWASP Security & CORS Headers
@header_remove("X-Powered-By");
header("X-Content-Type-Options: nosniff");
header("X-Frame-Options: SAMEORIGIN");
header("X-XSS-Protection: 1; mode=block");
header("Referrer-Policy: strict-origin-when-cross-origin");
header("Permissions-Policy: geolocation=(), camera=(), microphone=()");

// CORS: echo back only the configured frontend origin in production (comma
// separated list supported via FRONTEND_URL). Development allows any origin so
// local tooling on other ports (e.g. Live Server) keeps working.
$__algEnv    = alg_env('APP_ENV', 'production');
$__algOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($__algEnv, ['development', 'local', 'testing'], true)) {
    header("Access-Control-Allow-Origin: *");
} else {
    $__algAllowed = array_filter(array_map(function ($o) {
        return rtrim(trim($o), '/');
    }, explode(',', alg_env('FRONTEND_URL', ''))));
    if ($__algOrigin !== '' && in_array(rtrim($__algOrigin, '/'), $__algAllowed, true)) {
        header("Access-Control-Allow-Origin: $__algOrigin");
    }
    header("Vary: Origin");
}
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, PATCH, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-Organization-ID, X-API-Key, X-Impersonation-Org, X-Active-Org");
header("Content-Type: application/json; charset=UTF-8");

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// 2. PSR-4 Autoloader for `src/` Architecture (Alg\ Namespace)
spl_autoload_register(function ($class) {
    $prefix = 'Alg\\';
    $baseDir = __DIR__ . '/src/';
    $len = strlen($prefix);
    if (strncmp($prefix, $class, $len) !== 0) {
        return;
    }
    $relativeClass = substr($class, $len);
    $file = $baseDir . str_replace('\\', '/', $relativeClass) . '.php';
    if (file_exists($file)) {
        require_once $file;
    }
});

// 3. Universal Enterprise Error, SQL Exception & Fatal Shutdown Engine
\Alg\Audit\ErrorHandler::register();

// 4. Central Configuration Registry
class Config {
    public static function get($key, $default = null) {
        static $settings = null;
        if ($settings === null) {
            $settings = [
                'app_name' => alg_env('APP_NAME', 'ALG School OS API'),
                'app_env' => alg_env('APP_ENV', 'production'),
                'app_debug' => alg_env('APP_DEBUG', 'false'),
                'app_url' => alg_env('APP_URL', 'http://localhost/alg-school-os-api'),
                'frontend_url' => alg_env('FRONTEND_URL', alg_env('APP_URL', 'http://localhost')),
                'jwt_secret' => alg_env('JWT_SECRET', 'super_secret_alg_school_os_jwt_key_2026'),
                'jwt_expiry' => 86400 * 7, // 7 days
                'db_host' => alg_env('DB_HOST', '127.0.0.1'),
                'db_port' => alg_env('DB_PORT', '3306'),
                'db_name' => alg_env('DB_NAME', 'schoolos'),
                'db_user' => alg_env('DB_USER', 'root'),
                'db_pass' => alg_env('DB_PASS', ''),
                'storage_driver' => alg_env('STORAGE_DRIVER', 'local'),
                'paystack_secret' => alg_env('PAYSTACK_SECRET_KEY', ''),
                'paystack_public' => alg_env('PAYSTACK_PUBLIC_KEY', ''),
                'flutterwave_secret' => alg_env('FLUTTERWAVE_SECRET_KEY', ''),
                'flutterwave_public' => alg_env('FLUTTERWAVE_PUBLIC_KEY', ''),
                'flutterwave_webhook_secret' => alg_env('FLUTTERWAVE_WEBHOOK_SECRET', ''),
                'google_client_id' => alg_env('GOOGLE_CLIENT_ID', ''),
                'google_client_secret' => alg_env('GOOGLE_CLIENT_SECRET', ''),
                'microsoft_client_id' => alg_env('MICROSOFT_CLIENT_ID', ''),
                'microsoft_client_secret' => alg_env('MICROSOFT_CLIENT_SECRET', ''),
                'calendar_sync_enabled' => alg_env('CALENDAR_SYNC_ENABLED', 'false'),
                'ical_feed_url' => alg_env('ICAL_FEED_URL', ''),
                'aws_access_key_id' => alg_env('AWS_ACCESS_KEY_ID', ''),
                'aws_secret_access_key' => alg_env('AWS_SECRET_ACCESS_KEY', ''),
                'backup_encryption_key' => alg_env('BACKUP_ENCRYPTION_KEY', ''),
                'stripe_secret' => alg_env('STRIPE_SECRET_KEY', ''),
                'stripe_public' => alg_env('STRIPE_PUBLIC_KEY', ''),
                'stripe_webhook_secret' => alg_env('STRIPE_WEBHOOK_SECRET', ''),
                'paypal_client_id' => alg_env('PAYPAL_CLIENT_ID', ''),
                'paypal_client_secret' => alg_env('PAYPAL_CLIENT_SECRET', ''),
                'paypal_mode' => alg_env('PAYPAL_MODE', 'sandbox'),
                'opay_merchant_id' => alg_env('OPAY_MERCHANT_ID', ''),
                'opay_public_key' => alg_env('OPAY_PUBLIC_KEY', ''),
                'opay_private_key' => alg_env('OPAY_PRIVATE_KEY', ''),
                'termii_api_key' => alg_env('TERMII_API_KEY', ''),
                'termii_sender_id' => alg_env('TERMII_SENDER_ID', 'SCHOOLOS'),
                'twilio_account_sid' => alg_env('TWILIO_ACCOUNT_SID', ''),
                'twilio_auth_token' => alg_env('TWILIO_AUTH_TOKEN', ''),
                'twilio_from_number' => alg_env('TWILIO_FROM_NUMBER', ''),
                'sms_default_gateway' => alg_env('SMS_DEFAULT_GATEWAY', 'termii'),
                'openai_api_key' => alg_env('OPENAI_API_KEY', ''),
                'gemini_api_key' => alg_env('GEMINI_API_KEY', ''),
                'groq_api_key'   => alg_env('GROQ_API_KEY', ''),
                'groq_model'     => alg_env('GROQ_MODEL', 'llama-3.3-70b-versatile'),
                'ai_provider'    => alg_env('AI_PROVIDER', 'groq'),
                'python_ai_base_url' => alg_env('PYTHON_AI_BASE_URL', 'http://127.0.0.1:8000'),
                'python_ai_token'    => alg_env('PYTHON_AI_TOKEN', ''),
                'python_ai_model'    => alg_env('PYTHON_AI_MODEL', 'miss-algorithm-v1'),
            ];
        }
        return $settings[$key] ?? $default;
    }
}

// 4b. Fail closed if the built-in default JWT secret is still in use.
// That string ships in source code and is therefore public: anyone could forge a
// super_admin token with it. In PRODUCTION we refuse to serve rather than run
// insecurely. Development/local/testing environments are exempt so a dev machine
// can never be bricked by a missing/locked .env, and CLI (migrations, tooling)
// is exempt so operators can still run maintenance. Loopback requests (local
// tooling/tests) are also exempt — they can never expose a public deployment.
(function () {
    if (PHP_SAPI === 'cli') return;
    if (in_array(alg_env('APP_ENV', 'production'), ['development', 'local', 'testing'], true)) return;
    $__host = $_SERVER['HTTP_HOST'] ?? '';
    if (preg_match('/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i', $__host)) return;
    if (Config::get('jwt_secret') !== 'super_secret_alg_school_os_jwt_key_2026') return;
    http_response_code(500);
    header("Content-Type: application/json; charset=UTF-8");
    echo json_encode([
        'success' => false,
        'code'    => 'INSECURE_DEFAULT_JWT_SECRET',
        'message' => 'Server misconfigured: JWT_SECRET is not set, so the app would sign tokens with its public built-in default. Set a strong, unique JWT_SECRET (e.g. in .env) and retry.',
    ], JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    exit();
})();

// 5. Database Connection Factory (PDO Pool with Explicit Error Mode)
function getDbConnection() {
    static $db = null;
    if ($db === null) {
        try {
            $dsn = "mysql:host=" . Config::get('db_host') . ";port=" . Config::get('db_port') . ";dbname=" . Config::get('db_name') . ";charset=utf8mb4";
            $db = new PDO($dsn, Config::get('db_user'), Config::get('db_pass'), [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]);
        } catch (PDOException $e) {
            // In dev mode without MySQL, returns null to allow graceful demo simulation
            return null;
        }
    }
    return $db;
}

// 6. Standardized API Response Contracts with Request ID & Error Codes
function sendSuccess($data = [], $message = "Operation completed successfully.", $statusCode = 200, $meta = null) {
    http_response_code($statusCode);
    $response = [
        "success"     => true,
        "status"      => "success",
        "status_code" => $statusCode,
        "message"     => $message,
        "data"        => $data,
        "request_id"  => \Alg\Audit\ErrorHandler::getRequestId(),
        "timestamp"   => date('c')
    ];
    if ($meta !== null) {
        $response["meta"] = $meta;
    }
    echo json_encode($response, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit();
}

function sendError($message = "An error occurred", $statusCode = 400, $errors = [], string $errorCode = null) {
    http_response_code($statusCode);

    $defaultCodes = [
        400 => 'BAD_REQUEST',
        401 => 'UNAUTHORIZED',
        403 => 'FORBIDDEN',
        404 => 'NOT_FOUND',
        405 => 'METHOD_NOT_ALLOWED',
        409 => 'CONFLICT',
        413 => 'PAYLOAD_TOO_LARGE',
        415 => 'UNSUPPORTED_MEDIA_TYPE',
        422 => 'UNPROCESSABLE_ENTITY',
        429 => 'TOO_MANY_REQUESTS',
        500 => 'INTERNAL_SERVER_ERROR',
        502 => 'BAD_GATEWAY',
        503 => 'SERVICE_UNAVAILABLE'
    ];

    $code = $errorCode ?: ($defaultCodes[$statusCode] ?? 'ERROR');

    $response = [
        "success"     => false,
        "status"      => "error",
        "status_code" => $statusCode,
        "code"        => $code,
        "message"     => $message,
        "request_id"  => \Alg\Audit\ErrorHandler::getRequestId(),
        "method"      => $_SERVER['REQUEST_METHOD'] ?? 'GET',
        "path"        => $_SERVER['REQUEST_URI'] ?? '',
        "timestamp"   => date('c')
    ];

    if (!empty($errors)) {
        $response["errors"] = $errors;
    }

    if (\Alg\Audit\ErrorHandler::isDebugEnabled()) {
        $backtrace = debug_backtrace(DEBUG_BACKTRACE_IGNORE_ARGS, 3);
        $caller = $backtrace[1] ?? ($backtrace[0] ?? []);
        $response["debug"] = [
            "caller"   => ($caller['file'] ?? '') . ":" . ($caller['line'] ?? ''),
            "function" => $caller['function'] ?? ''
        ];
    }

    echo json_encode($response, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit();
}

// 7. Robust JSON Input Payload Parser (with Malformed Syntax Detection)
function getJsonInput(): array {
    $raw = file_get_contents("php://input");

    // Check $_POST if input stream is empty (e.g. standard form submission or FormData)
    if (empty($raw) || trim($raw) === '') {
        return $_POST ?: [];
    }

    $decoded = json_decode($raw, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        sendError(
            "Malformed JSON payload: " . json_last_error_msg(),
            400,
            [
                'json_syntax_error' => json_last_error_msg(),
                'sample_received'   => substr($raw, 0, 120) . (strlen($raw) > 120 ? '...' : '')
            ],
            'PAYLOAD_MALFORMED_JSON'
        );
    }

    return is_array($decoded) ? $decoded : [];
}

// 7. JWT Token Generator & Verifier
function generateJwtToken($userId, $role = 'user', $orgId = 1, $email = '', $permissions = []) {
    $header = json_encode(['typ' => 'JWT', 'alg' => 'HS256']);
    $payload = json_encode([
        'sub'         => $userId,
        'email'       => $email,
        'role'        => $role,
        'org_id'      => $orgId,
        'permissions' => $permissions,
        'iat'         => time(),
        'exp'         => time() + Config::get('jwt_expiry', 86400)
    ]);

    $base64UrlHeader = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($header));
    $base64UrlPayload = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($payload));
    $signature = hash_hmac('sha256', $base64UrlHeader . "." . $base64UrlPayload, Config::get('jwt_secret'), true);
    $base64UrlSignature = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($signature));

    return $base64UrlHeader . "." . $base64UrlPayload . "." . $base64UrlSignature;
}

/**
 * Read the personal API key from the request headers, if present.
 *
 * Supported header: `X-API-Key: alg_live_...`
 */
function algApiKeyHeader(): string {
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    foreach (['X-API-Key', 'x-api-key', 'X-Api-Key'] as $name) {
        if (!empty($headers[$name])) {
            return trim((string) $headers[$name]);
        }
    }
    if (!empty($_SERVER['HTTP_X_API_KEY'])) {
        return trim((string) $_SERVER['HTTP_X_API_KEY']);
    }
    return '';
}

/**
 * Resolve an API key to its owning user, or null when the key is unknown,
 * revoked or expired. Records last_used_at / IP for the Account Settings UI.
 *
 * Keys are stored as SHA-256 hashes, so the plaintext is only ever shown once
 * at creation time.
 */
function algUserFromApiKey(string $rawKey): ?array {
    if ($rawKey === '') {
        return null;
    }

    try {
        $db = getDbConnection();
        if (!$db) {
            return null;
        }

        $hash = hash('sha256', $rawKey);
        $stmt = $db->prepare(
            "SELECT k.id AS key_id, k.user_id, k.org_id, u.email, u.role
               FROM user_api_keys k
               JOIN users u ON u.id = k.user_id
              WHERE k.key_hash = :hash
                AND k.revoked_at IS NULL
                AND (k.expires_at IS NULL OR k.expires_at > NOW())
                AND u.deleted_at IS NULL
                AND u.status = 'active'
              LIMIT 1"
        );
        $stmt->execute([':hash' => $hash]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            return null;
        }

        $ip = isset($_SERVER['REMOTE_ADDR']) ? substr((string) $_SERVER['REMOTE_ADDR'], 0, 45) : null;
        $db->prepare(
            "UPDATE user_api_keys SET last_used_at = NOW(), last_used_ip = :ip WHERE id = :id"
        )->execute([':ip' => $ip, ':id' => (int) $row['key_id']]);

        $payload = [
            'sub'    => (int) $row['user_id'],
            'email'  => $row['email'],
            'role'   => $row['role'],
            'org_id' => (int) $row['org_id'],
        ];

        return [
            'id'          => (int) $row['user_id'],
            'email'       => $row['email'],
            'role'        => $row['role'],
            'org_id'      => (int) $row['org_id'],
            'permissions' => resolveAuthUserPermissions($payload),
            'auth_via'    => 'api_key',
            'api_key_id'  => (int) $row['key_id'],
        ];
    } catch (\Throwable $e) {
        // Missing table / DB hiccup must fall through to the normal 401.
        return null;
    }
}

function verifyAuthToken() {
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    
    // Support Apache/Nginx Authorization header forwarding
    if (empty($authHeader) && isset($_SERVER['HTTP_AUTHORIZATION'])) {
        $authHeader = $_SERVER['HTTP_AUTHORIZATION'];
    } elseif (empty($authHeader) && isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
        $authHeader = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
    }
    
    if (!preg_match('/Bearer\s(\S+)/', $authHeader, $matches)) {
        // Personal API keys (Account Settings -> API Keys) authenticate
        // server-to-server calls that cannot send a browser Bearer token.
        $apiKeyUser = algUserFromApiKey(algApiKeyHeader());
        if ($apiKeyUser !== null) {
            algEnforcePlanAccess($apiKeyUser);
            return $apiKeyUser;
        }

        sendError("Unauthorized access. Bearer token required in Authorization header.", 401, [], 'AUTH_TOKEN_MISSING');
    }
    
    $token = $matches[1];

    // Only cryptographically signed JWTs are accepted. Demo/opaque tokens
    // (e.g. "demo_*") are intentionally rejected — there is no bypass.
    $parts = explode('.', $token);
    if (count($parts) !== 3) {
        sendError("Invalid authorization token structure. JWT format expected.", 401, [], 'AUTH_TOKEN_MALFORMED');
    }

    list($b64Header, $b64Payload, $b64Signature) = $parts;
    
    // Cryptographic HMAC-SHA256 Signature Verification (Anti-Tampering)
    $expectedSignature = hash_hmac('sha256', "{$b64Header}.{$b64Payload}", Config::get('jwt_secret'), true);
    $expectedB64 = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($expectedSignature));
    
    if (!hash_equals($expectedB64, $b64Signature)) {
        sendError("Token signature verification failed. Forged or modified token detected.", 401, [], 'AUTH_TOKEN_SIGNATURE_INVALID');
    }

    $payload = json_decode(base64_decode(str_replace(['-', '_'], ['+', '/'], $b64Payload)), true);
    if (!$payload || !isset($payload['exp']) || $payload['exp'] < time()) {
        sendError("Session token has expired. Please refresh your token or log in again.", 401, [], 'AUTH_TOKEN_EXPIRED');
    }

    $user = [
        'id'          => $payload['sub'] ?? 1,
        'email'       => $payload['email'] ?? 'admin@alg.company',
        'role'        => $payload['role'] ?? 'user',
        'org_id'      => $payload['org_id'] ?? 1,
        // Permissions are re-resolved from the DB on every request so role and
        // permission changes take effect immediately, without a re-login. If the
        // database is unreachable we fall back to the permissions baked into the
        // token so auth/token endpoints stay functional during DB hiccups.
        'permissions' => resolveAuthUserPermissions($payload)
    ];

    // Server-side plan/module enforcement: the frontend Plan Access Gate only
    // *hides* routes a school's plan does not unlock, so every authenticated
    // endpoint re-checks the plan here (see algEnforcePlanAccess()).
    algEnforcePlanAccess($user);

    return $user;
}

// 8. ALG Enterprise RBAC & Auth Guard Helpers
function requireAuth() {
    $user = verifyAuthToken();
    return (int)$user['id'];
}

function requireAdmin() {
    $user = verifyAuthToken();
    $adminRoles = ['super_admin', 'product_admin', 'school_admin', 'admin'];
    if (!in_array($user['role'], $adminRoles, true)) {
        sendError("Forbidden. Administrator privileges required.", 403, [
            'required_roles' => $adminRoles,
            'current_role'   => $user['role']
        ], 'FORBIDDEN_ADMIN_REQUIRED');
    }
    return (int)$user['id'];
}

/**
 * Record a denied permission check in `access_logs` before the 403 is emitted.
 *
 * Best-effort only: logging must never change the authorization outcome or
 * break the response when the table/DB is unavailable. This closes the audit
 * gap where blocked actions (for example an unauthorised attempt to read a
 * child's protected record) left no server-side trace.
 */
function algLogDeniedPermission(array $user, string $permissionKey): void {
    try {
        $db = getDbConnection();
        if (!$db) return;

        $actorId = (int)($user['id'] ?? 0);
        if ($actorId <= 0) return;

        $orgId = (int)($user['org_id'] ?? 0);
        try {
            $resolved = resolveEffectiveOrgId($user, $db);
            if ($resolved > 0) $orgId = $resolved;
        } catch (\Throwable $e) {
            /* keep the token's org id when the active-org header is unusable */
        }
        if ($orgId <= 0) return;

        $actorName = (string)($user['email'] ?? '');
        try {
            $st = $db->prepare("SELECT name FROM users WHERE id = :id LIMIT 1");
            $st->execute([':id' => $actorId]);
            $name = $st->fetchColumn();
            if ($name !== false && $name !== null && $name !== '') $actorName = (string)$name;
        } catch (\Throwable $e) {}

        $stmt = $db->prepare(
            "INSERT INTO access_logs
                (org_id, actor_id, actor_name, action, entity, entity_id, detail, ip_address, user_agent, created_at)
             VALUES
                (:org, :actor, :name, 'Denied access', 'permission', :perm, :detail, :ip, :ua, NOW())"
        );
        $stmt->execute([
            ':org'    => $orgId,
            ':actor'  => $actorId,
            ':name'   => $actorName,
            ':perm'   => substr($permissionKey, 0, 100),
            ':detail' => 'Blocked: missing required permission "' . $permissionKey . '".',
            ':ip'     => isset($_SERVER['REMOTE_ADDR']) ? substr((string)$_SERVER['REMOTE_ADDR'], 0, 45) : null,
            ':ua'     => isset($_SERVER['HTTP_USER_AGENT']) ? substr((string)$_SERVER['HTTP_USER_AGENT'], 0, 255) : null,
        ]);
    } catch (\Throwable $e) {
        /* never block or alter the 403 response */
    }
}

function requirePermission(string $permissionKey) {
    $user = verifyAuthToken();
    if ($user['role'] === 'super_admin') {
        return (int)$user['id'];
    }
    $permissions = $user['permissions'] ?? [];
    if (!in_array($permissionKey, $permissions) && !in_array('*', $permissions)) {
        algLogDeniedPermission($user, $permissionKey);
        sendError("Forbidden. You lack the '{$permissionKey}' permission.", 403, [
            'required_permission' => $permissionKey,
            'user_permissions'    => $permissions
        ], 'FORBIDDEN_PERMISSION_DENIED');
    }
    return (int)$user['id'];
}

/**
 * Non-terminating permission probe. Unlike requirePermission(), this returns a
 * boolean instead of emitting a 403 and exiting, so an endpoint can accept one
 * of several permissions ("classes.update OR attendance.update") without
 * aborting on the first miss. Super admins always pass.
 *
 * Pass the user array returned by verifyAuthToken() to avoid re-verifying.
 */
function algUserCan(array $user, string $permissionKey): bool {
    if (($user['role'] ?? '') === 'super_admin') return true;
    $permissions = $user['permissions'] ?? [];
    return in_array($permissionKey, $permissions, true) || in_array('*', $permissions, true);
}

/* ---------------------------------------------------------------- plan gating
 * 8b. Server-side plan / module enforcement.
 *
 * The Plan Access Gate on the frontend (assets/js/alg/alg-plan-gate.js) only
 * *hides* routes a school's plan does not unlock. That is a UX affordance, not a
 * security boundary: a school could still call a module's API endpoint directly.
 * These helpers close that gap by enforcing the plan's `modules` list on the
 * server, at the one auth choke point every endpoint already passes through
 * (verifyAuthToken()).
 *
 * Policy:
 *   - Platform admins (super_admin / product_admin) always bypass plan gating;
 *     they are trusted operators (and may be switched into a school to support it).
 *   - Endpoints that map to no module (auth, settings, fees, admissions, email,
 *     platform, …) are always allowed.
 *   - An org with no plan assigned inherits the default plan, mirroring the
 *     frontend fallback, so onboarding/platform orgs are never locked out.
 *   - Any unexpected error fails OPEN: plan enforcement must never take a request
 *     down on its own.
 */

/** Map an API path (relative to .../api/) to the plan module it requires, or null. */
function algPlanModuleForApiPath(string $rel): ?string {
    $rel = strtolower(trim($rel, '/'));
    if ($rel === '') return null;

    // Most-specific file matches win over the directory fallback below.
    static $files = [
        // ---- Assessments & Results -------------------------------------------
        'assessments/analytics.php'               => 'assessment_analytics',
        'assessments/report-cards.php'            => 'report_cards',
        'assessments/report-cards-save.php'       => 'report_cards',
        'assessments/results.php'                 => 'results',
        'assessments/results-save.php'            => 'results',
        'assessments/banks.php'                   => 'question_banks',
        'assessments/questions.php'               => 'question_banks',
        'assessments/library.php'                 => 'assessment_library',
        'assessments/cbt.php'                     => 'cbt',
        'assessments/cbt-session.php'             => 'cbt',
        'assessments/marking.php'                 => 'marking',
        'assessments/marking-task.php'            => 'marking',
        'assessments/score-entry.php'             => 'score_entry',
        'assessments/scores.php'                  => 'score_entry',
        'assessments/setup.php'                   => 'assessment_setup',
        'assessments/types.php'                   => 'assessment_setup',
        'assessments/settings.php'                => 'assessment_settings',
        'assessments/settings-save.php'           => 'assessment_settings',
        'assessments/my-assessments.php'          => 'my_assessments',
        'assessments/my-assessments-session.php'  => 'my_assessments',
        'assessments/my-assessments-save.php'     => 'my_assessments',
        'assessments/hub.php'                     => 'assessment_hub',
        'assessments/assessment.php'              => 'assessment_hub',
        // ---- Finance & Bursary ------------------------------------------------
        'finance/subscriptions.php'               => 'subscriptions',
        'finance/invoices.php'                    => 'invoices',
        'finance/installments.php'                => 'invoices',
        'finance/statements.php'                  => 'invoices',
        'finance/reminders.php'                   => 'invoices',
        'finance/invoice-document.php'            => 'invoices',
        'finance/email-invoice.php'               => 'invoices',
        'finance/payments.php'                    => 'payments',
        'finance/receipts.php'                    => 'payments',
        'finance/payment-proofs.php'              => 'payments',
        'finance/ledger.php'                      => 'general_ledger',
        'finance/expenses.php'                    => 'general_ledger',
        'finance/budgets.php'                     => 'general_ledger',
        'finance/procurement.php'                 => 'general_ledger',
        'finance/payroll.php'                     => 'general_ledger',
        'finance/currencies.php'                  => 'general_ledger',
        'finance/export.php'                      => 'general_ledger',
        'finance/reports.php'                     => 'general_ledger',
        'finance/bank-reconciliation.php'         => 'general_ledger',
        // ---- AI (Miss Algorithm) ----------------------------------------------
        'ai/generate.php'                         => 'ai_dispatcher',
        'ai/groq-chat.php'                        => 'ai_dispatcher',
        // ---- SMS & Notifications -----------------------------------------------
        'sms/send.php'                            => 'communication_hub',
        'sms/broadcast.php'                       => 'communication_hub',
        'sms/logs.php'                            => 'communication_hub',
        'sms/preferences.php'                     => 'communication_hub',
        // ---- AI Early Warning --------------------------------------------------
        'ai/early-warning.php'                    => 'ai_dispatcher',
        // ---- AI Weekly Digest --------------------------------------------------
        'ai/weekly-digest.php'                    => 'ai_dispatcher',
        // ---- AI Usage Telemetry -----------------------------------------------
        'ai/usage.php'                            => 'ai_dispatcher',
    ];
    if (isset($files[$rel])) return $files[$rel];

    // Directory-level fallbacks (any file in the folder not listed above).
    static $dirs = [
        'students'    => 'students',
        'staff'       => 'staff',
        'teachers'    => 'staff',
        'parents'     => 'parents',
        'classes'     => 'classes',
        'assessments' => 'assessment_hub',
        'communication' => 'communication_hub',
        'operations'  => 'operations',
    ];
    $dir = explode('/', $rel)[0];
    return $dirs[$dir] ?? null;
}

/** The current request path relative to the API root (e.g. "finance/invoices.php"). */
function algCurrentApiRelativePath(): string {
    static $cached = null;
    if ($cached !== null) return $cached;

    $path = '';
    if (!empty($_SERVER['REQUEST_URI'])) {
        $path = (string)parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
    }
    if ($path === '' && !empty($_SERVER['SCRIPT_NAME'])) $path = (string)$_SERVER['SCRIPT_NAME'];
    if ($path === '' && !empty($_SERVER['PHP_SELF']))    $path = (string)$_SERVER['PHP_SELF'];

    $path = str_replace('\\', '/', $path);
    $pos  = strpos($path, '/api/');
    $rel  = $pos !== false ? substr($path, $pos + 5) : '';
    return $cached = strtolower(trim($rel, '/'));
}

/** Plan module keys that satisfy a required module (backward-compat aliases). */
function algPlanModuleAliases(string $module): array {
    // Older saved plans may still list the retired `teachers` key; it unlocks the
    // unified Staff & Faculty module exactly like `staff` does.
    if ($module === 'staff') return ['staff', 'teachers'];
    return [$module];
}

/**
 * True when the org family's plan unlocks a module. Mirrors the frontend
 * fallback (an org with no plan inherits the default plan) and fails OPEN on any
 * error. Used by feature surfaces (e.g. cross-entity search) that need to decide
 * whether to include a module's records without aborting the whole request.
 */
function algOrgHasPlanModule($db, int $orgId, string $module): bool {
    static $cache = [];
    if (!$db || $orgId <= 0) return true;

    try {
        $root = resolveOrgFamilyRoot($db, $orgId);
        $key  = $root . '|' . $module;
        if (array_key_exists($key, $cache)) return $cache[$key];

        $stmt = $db->prepare("SELECT plan_code FROM organizations WHERE id = :id AND deleted_at IS NULL LIMIT 1");
        $stmt->execute([':id' => $root]);
        $planCode = (string)($stmt->fetchColumn() ?: '');

        if ($planCode === '') {
            $planCode = (string)($db->query("SELECT code FROM plans WHERE is_default = 1 ORDER BY sort_order LIMIT 1")->fetchColumn() ?: 'mode2');
        }

        $p = $db->prepare("SELECT modules FROM plans WHERE code = :c LIMIT 1");
        $p->execute([':c' => $planCode]);
        $json = $p->fetchColumn();
        if ($json === false || $json === null) return $cache[$key] = true; // unknown plan → fail open

        $modules = json_decode((string)$json, true);
        if (!is_array($modules)) return $cache[$key] = true;

        return $cache[$key] = (bool)array_intersect(algPlanModuleAliases($module), $modules);
    } catch (\Throwable $e) {
        return true; // never let a plan lookup break a read surface
    }
}

/**
 * Enforce plan access for the current *mapped* endpoint. Invoked from
 * verifyAuthToken() so every authenticated endpoint is covered exactly once per
 * request (guarded by a request-scoped cache).
 */
function algEnforcePlanAccess(array $user): void {
    static $checked = [];
    $rel = algCurrentApiRelativePath();
    if (isset($checked[$rel])) return;

    $module = algPlanModuleForApiPath($rel);
    if ($module === null) return;              // core / unmapped endpoint — always allowed

    $checked[$rel] = true;

    // Trusted platform operators bypass plan gating entirely.
    if (isPlatformAdminRole((string)($user['role'] ?? ''))) return;

    try {
        $db = getDbConnection();
        if (!$db) return;                      // fail open: DB-bound endpoints abort downstream

        $effective = resolveEffectiveOrgId($user, $db);
        $root      = resolveOrgFamilyRoot($db, $effective);

        $stmt = $db->prepare("SELECT plan_code FROM organizations WHERE id = :id AND deleted_at IS NULL LIMIT 1");
        $stmt->execute([':id' => $root]);
        $planCode = (string)($stmt->fetchColumn() ?: '');

        if ($planCode === '') {
            // Mirror the frontend fallback: the default plan governs.
            $planCode = (string)($db->query("SELECT code FROM plans WHERE is_default = 1 ORDER BY sort_order LIMIT 1")->fetchColumn() ?: 'mode2');
        }

        $p = $db->prepare("SELECT modules FROM plans WHERE code = :c LIMIT 1");
        $p->execute([':c' => $planCode]);
        $json = $p->fetchColumn();
        if ($json === false || $json === null) return;   // unknown plan code → fail open

        $modules = json_decode((string)$json, true);
        if (!is_array($modules)) $modules = [];

        if (array_intersect(algPlanModuleAliases($module), $modules)) return;

        sendError(
            "Forbidden. Your school's plan ('{$planCode}') does not include the '{$module}' module.",
            403,
            ['required_module' => $module, 'plan_code' => $planCode, 'endpoint' => $rel],
            'FORBIDDEN_MODULE_NOT_IN_PLAN'
        );
    } catch (\Throwable $e) {
        // Never let plan enforcement break a request on an unexpected error.
        return;
    }
}

// 9. Input Sanitization & Validation Helpers
function validateRequired(array $fields, array $data) {
    $missing = [];
    foreach ($fields as $field) {
        if (!isset($data[$field]) || trim((string)$data[$field]) === '') {
            $missing[$field] = "Field '{$field}' is required and cannot be empty.";
        }
    }
    if (!empty($missing)) {
        sendError(
            "Validation failed: " . implode(', ', array_keys($missing)) . " required.",
            422,
            $missing,
            'VALIDATION_FAILED'
        );
    }
}

function sanitizeInput($data) {
    if (is_array($data)) {
        return array_map('sanitizeInput', $data);
    }
    return htmlspecialchars(strip_tags(trim((string)$data)), ENT_QUOTES, 'UTF-8');
}

// 9b. Shared Authentication & RBAC Helpers
/**
 * Fail fast with a clean 503 when the database is unreachable.
 * Auth and persistence endpoints must never fall back to mock data.
 */
function requireDatabase($db) {
    if (!$db) {
        sendError(
            "Service temporarily unavailable: the database connection could not be established.",
            503,
            [],
            'DB_UNAVAILABLE'
        );
    }
    return $db;
}

/* ---------------------------------------------------------------- impersonation
 * Platform administrators (super_admin / product_admin) may "switch into" any
 * school to support it. The frontend school switcher sends the target org in the
 * X-Impersonation-Org header. These helpers keep that switch server-authoritative
 * and strictly limited to platform roles.
 */

/** Roles that may switch between / impersonate schools. */
function isPlatformAdminRole($role): bool {
    return in_array($role, ['super_admin', 'product_admin'], true);
}

/** Read the X-Impersonation-Org header (0 when absent/invalid). */
function getImpersonationOrgHeader(): int {
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    $raw = $headers['X-Impersonation-Org']
        ?? $headers['x-impersonation-org']
        ?? ($_SERVER['HTTP_X_IMPERSONATION_ORG'] ?? '');
    $id = (int)$raw;
    return $id > 0 ? $id : 0;
}

/** Read the X-Active-Org header (0 when absent/invalid). */
function getActiveOrgHeader(): int {
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    $raw = $headers['X-Active-Org']
        ?? $headers['x-active-org']
        ?? ($_SERVER['HTTP_X_ACTIVE_ORG'] ?? '');
    $id = (int)$raw;
    return $id > 0 ? $id : 0;
}

/** True when the org exists and is not soft-deleted. */
function organizationExists($db, int $orgId): bool {
    if (!$db || $orgId <= 0) return false;
    try {
        $stmt = $db->prepare("SELECT id FROM organizations WHERE id = :id AND deleted_at IS NULL LIMIT 1");
        $stmt->execute([':id' => $orgId]);
        return (bool)$stmt->fetch();
    } catch (Exception $e) {
        return false;
    }
}

/**
 * The head-of-family org id. A standalone school (parent_org_id NULL) is its own
 * root; a branch resolves to its parent HQ.
 */
function resolveOrgFamilyRoot($db, int $orgId): int {
    if (!$db || $orgId <= 0) return $orgId;
    try {
        $stmt = $db->prepare("SELECT id, parent_org_id FROM organizations WHERE id = :id AND deleted_at IS NULL LIMIT 1");
        $stmt->execute([':id' => $orgId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) return $orgId;
        return (int)($row['parent_org_id'] ?: $row['id']);
    } catch (Exception $e) {
        return $orgId;
    }
}

/** A school user may act within their own campus family (HQ + sibling branches). */
function canAccessOrgFamily($db, int $userOrgId, int $targetOrgId): bool {
    if ($userOrgId === $targetOrgId) return true;
    return resolveOrgFamilyRoot($db, $userOrgId) === resolveOrgFamilyRoot($db, $targetOrgId);
}

/**
 * The family root a caller is allowed to administer. Platform admins may point at
 * an org (X-Impersonation-Org / X-Active-Org / ?org_id); school users are always
 * pinned to their own campus family.
 */
function resolveManagingRoot($db, array $currentUser): int {
    if (isPlatformAdminRole($currentUser['role'] ?? '')) {
        return resolveOrgFamilyRoot($db, resolveEffectiveOrgId($currentUser, $db));
    }
    return resolveOrgFamilyRoot($db, (int)($currentUser['org_id'] ?? 1));
}

/**
 * Resolve the tenant a request should act on.
 *
 * - Platform admins: the X-Impersonation-Org header (switched into a school) wins,
 *   otherwise X-Active-Org (e.g. previewing a campus); either must exist in the DB.
 * - School-level users: X-Active-Org is honoured ONLY when the target campus is in
 *   the caller's own branch family, so the header can never be used to escape
 *   tenant isolation.
 * - Everyone else is pinned to their own org_id.
 */
function resolveEffectiveOrgId(array $user, $db = null): int {
    $default = (int)($user['org_id'] ?? 1);
    $role = $user['role'] ?? '';

    if (isPlatformAdminRole($role)) {
        $requested = getImpersonationOrgHeader() ?: getActiveOrgHeader();
        if ($requested <= 0) return $default;
        if (!$db || organizationExists($db, $requested)) return $requested;
        return $default;
    }

    $requested = getActiveOrgHeader();
    if ($requested <= 0 || $requested === $default) return $default;
    if ($db && canAccessOrgFamily($db, $default, $requested)) return $requested;
    return $default;
}

/* ---------------------------------------------------------------- school levels
 * The education levels a campus offers. Per-branch independent: each campus
 * stores its own list in `org_settings` under `school_levels` (a JSON array of
 * canonical band names) plus `school_type` (the onboarding school-type code).
 * A campus with no explicit list keeps every level, so schools onboarded before
 * this feature are unaffected. Every level-scoped picker and every class/subject
 * write validates against these helpers.
 */

if (!defined('ALG_SCHOOL_LEVELS')) {
    define('ALG_SCHOOL_LEVELS', ['Early Years / Nursery', 'Primary', 'Junior Secondary', 'Senior Secondary']);
}

/** Default levels implied by an onboarding school-type code. */
function algLevelsForSchoolType(?string $type): array {
    $t = strtolower(trim((string)$type));
    switch ($t) {
        case 'nursery':
        case 'montessori':
        case 'ecce':
            return ['Early Years / Nursery'];
        case 'primary':
            return ['Primary'];
        case 'nursery-primary':
            return ['Early Years / Nursery', 'Primary'];
        case 'junior-secondary':
        case 'jss':
            return ['Junior Secondary'];
        case 'senior-secondary':
        case 'sss':
            return ['Senior Secondary'];
        case 'secondary':
            return ['Junior Secondary', 'Senior Secondary'];
        default:
            return ALG_SCHOOL_LEVELS; // combined / unknown / unset => everything
    }
}

/** Human label for a school-type code. */
function algSchoolTypeLabel(?string $type): string {
    $labels = [
        'nursery'          => 'Nursery / Early Years',
        'primary'          => 'Primary School',
        'nursery-primary'  => 'Nursery & Primary',
        'junior-secondary' => 'Junior Secondary (JSS)',
        'senior-secondary' => 'Senior Secondary (SSS)',
        'secondary'        => 'Secondary School',
        'combined'         => 'Combined / All-through',
    ];
    $t = strtolower(trim((string)$type));
    return $labels[$t] ?? ($t !== '' ? ucwords(str_replace('-', ' ', $t)) : '');
}

/** Normalise arbitrary input (JSON string, CSV, or array) to a validated, ordered subset. */
function algNormaliseLevels($levels): array {
    if (is_string($levels)) {
        $decoded = json_decode($levels, true);
        $levels = is_array($decoded)
            ? $decoded
            : array_filter(array_map('trim', explode(',', $levels)), fn($v) => $v !== '');
    }
    if (!is_array($levels)) return [];
    $out = [];
    foreach (ALG_SCHOOL_LEVELS as $canon) {
        foreach ($levels as $l) {
            if (strcasecmp(trim((string)$l), $canon) === 0) { $out[] = $canon; break; }
        }
    }
    return $out;
}

/** Read the levels a campus offers (defaults to every canonical level). */
function algOrgSchoolLevels($db, int $orgId): array {
    if ($orgId <= 0) return ALG_SCHOOL_LEVELS;
    try {
        if (!$db) $db = getDbConnection();
        $s = $db->prepare("SELECT setting_value FROM org_settings WHERE org_id = :o AND setting_key = 'school_levels' LIMIT 1");
        $s->execute([':o' => $orgId]);
        $raw = $s->fetchColumn();
        if ($raw === false || $raw === null || trim((string)$raw) === '') return ALG_SCHOOL_LEVELS;
        $parsed = algNormaliseLevels((string)$raw);
        return $parsed ?: ALG_SCHOOL_LEVELS;
    } catch (\Throwable $e) {
        return ALG_SCHOOL_LEVELS;
    }
}

/** Read a campus' onboarding school-type code ('' when unset). */
function algOrgSchoolType($db, int $orgId): string {
    if ($orgId <= 0) return '';
    try {
        if (!$db) $db = getDbConnection();
        $s = $db->prepare("SELECT setting_value FROM org_settings WHERE org_id = :o AND setting_key = 'school_type' LIMIT 1");
        $s->execute([':o' => $orgId]);
        $v = $s->fetchColumn();
        return $v === false ? '' : (string)$v;
    } catch (\Throwable $e) {
        return '';
    }
}

/** True when a campus offers the given band level. '' and 'All' always pass. */
function algOrgOffersLevel($db, int $orgId, ?string $level): bool {
    $lvl = trim((string)$level);
    if ($lvl === '' || $lvl === 'All') return true;
    foreach (algOrgSchoolLevels($db, $orgId) as $o) {
        if (strcasecmp($o, $lvl) === 0) return true;
    }
    return false;
}

/* -------------------------------------------------------- role & permission model
 * Roles are catalogued in `roles` (org_id 0 = platform/system role shared by all
 * schools; org_id > 0 = a school's custom role, or a per-school override of a
 * system role). The role -> permission matrix lives in `role_permissions`,
 * scoped by org_id. A user's effective permissions are the union of their base
 * role (users.role) plus any extra roles (user_roles) — mirroring the ALG Studio
 * staff RBAC reference.
 *
 * For a given role: if the caller's org has a `roles` row for that key, the
 * org-scoped matrix is authoritative (so a school may widen OR narrow a system
 * role for its own users only); otherwise the global default at org_id 0 applies.
 */

/** Normalise an arbitrary label into a safe machine role key. */
function normalizeRoleKey(string $role): string {
    $role = strtolower(trim($role));
    $role = preg_replace('/[^a-z0-9]+/', '_', (string)$role);
    return trim((string)$role, '_');
}

/** Permission keys granted to $role at exactly the given org scope (no fallback). */
function rolePermissionKeys($db, string $role, int $orgId = 0): array {
    if (!$db || $role === '') return [];
    try {
        $stmt = $db->prepare("
            SELECT p.`key`
            FROM role_permissions rp
            JOIN permissions p ON p.id = rp.permission_id
            WHERE rp.role = :role AND rp.org_id = :org
        ");
        $stmt->execute([':role' => $role, ':org' => $orgId]);
        return array_values(array_unique($stmt->fetchAll(PDO::FETCH_COLUMN) ?: []));
    } catch (\Throwable $e) {
        return [];
    }
}

/** True when $orgId has its own catalog entry for $role (custom role or override). */
function roleHasOrgCatalogRow($db, int $orgId, string $role): bool {
    if (!$db || $orgId <= 0 || $role === '') return false;
    try {
        $stmt = $db->prepare("SELECT 1 FROM roles WHERE org_id = :org AND `key` = :role AND deleted_at IS NULL LIMIT 1");
        $stmt->execute([':org' => $orgId, ':role' => $role]);
        return (bool)$stmt->fetchColumn();
    } catch (\Throwable $e) {
        return false;
    }
}

/** Effective permission keys for one role, honouring per-school overrides. */
function resolveRolePermissionKeys($db, string $role, int $orgId = 0): array {
    if ($role === '') return [];
    if ($orgId > 0) {
        // Roles are configured at a campus family root (HQ), so an override set
        // by a school administrator applies across the whole family. A campus-
        // specific row (rare) is honoured before falling back to the global.
        $root = resolveOrgFamilyRoot($db, $orgId);
        if (roleHasOrgCatalogRow($db, $root, $role)) {
            return rolePermissionKeys($db, $role, $root);
        }
        if ($orgId !== $root && roleHasOrgCatalogRow($db, $orgId, $role)) {
            return rolePermissionKeys($db, $role, $orgId);
        }
    }
    return rolePermissionKeys($db, $role, 0);
}

/** Extra (non-base) roles assigned to a user via `user_roles`. */
function getUserExtraRoles($db, int $userId): array {
    if (!$db || $userId <= 0) return [];
    try {
        $stmt = $db->prepare("SELECT role FROM user_roles WHERE user_id = :uid ORDER BY role");
        $stmt->execute([':uid' => $userId]);
        return array_values(array_unique($stmt->fetchAll(PDO::FETCH_COLUMN) ?: []));
    } catch (\Throwable $e) {
        return [];
    }
}

/** Every role a user holds: the base role plus any extras. */
function getUserEffectiveRoles($db, int $userId, string $baseRole = ''): array {
    $roles = [];
    if ($baseRole !== '') $roles[] = $baseRole;
    foreach (getUserExtraRoles($db, $userId) as $r) $roles[] = $r;
    return array_values(array_unique(array_filter($roles)));
}

/**
 * Resolve the effective permission keys for a role set.
 * super_admin always receives the wildcard.
 */
function fetchUserPermissions($db, string $role, int $orgId = 0, array $extraRoles = []): array {
    $role  = $role !== '' ? $role : 'user';
    $roles = array_values(array_unique(array_filter(array_merge([$role], $extraRoles))));

    if (in_array('super_admin', $roles, true)) {
        return ['*'];
    }
    if (!$db) {
        return [];
    }

    $perms = [];
    foreach ($roles as $r) {
        foreach (resolveRolePermissionKeys($db, $r, $orgId) as $k) {
            $perms[$k] = true;
        }
    }
    $perms = array_keys($perms);
    if ($role === 'product_admin' && empty($perms)) {
        return ['*'];
    }
    return $perms;
}

/** Re-resolve a verified token's permissions from the DB (immediate effect). */
function resolveAuthUserPermissions(array $payload): array {
    $fallback = is_array($payload['permissions'] ?? null) ? $payload['permissions'] : [];
    static $cache = [];

    $userId = (int)($payload['sub'] ?? 0);
    $role   = (string)($payload['role'] ?? 'user');
    $orgId  = (int)($payload['org_id'] ?? 0);
    $key    = $userId . '|' . $role . '|' . $orgId;
    if (array_key_exists($key, $cache)) return $cache[$key];

    try {
        $db = getDbConnection();
        if (!$db) return $cache[$key] = $fallback;
        $extra = getUserExtraRoles($db, $userId);
        $perms = fetchUserPermissions($db, $role, $orgId, $extra);
        return $cache[$key] = algTeachingStaffEffectivePermissions($userId, $role, $perms);
    } catch (\Throwable $e) {
        return $cache[$key] = $fallback;
    }
}

/** Canonical display labels for the built-in role keys. */
function algRoleLabels(): array {
    return [
        'super_admin'          => 'Super Administrator',
        'product_admin'        => 'Product Administrator',
        'school_owner'         => 'School Owner',
        'school_admin'         => 'School Administrator',
        'vice_principal'       => 'Vice Principal',
        'academic_coordinator' => 'Academic Coordinator',
        'form_teacher'         => 'Form Teacher',
        'teacher'              => 'Teacher',
        'hod'                  => 'Head of Department (HOD)',
        'exam_officer'         => 'Examination Officer',
        'staff'                => 'Staff Member',
        'bursar'               => 'Bursar',
        'hr_manager'           => 'HR Manager',
        'librarian'            => 'Librarian',
        'nurse'                => 'School Nurse',
        'transport_manager'    => 'Transport Manager',
        'store_manager'        => 'Store Manager',
        'student'              => 'Student',
        'parent'               => 'Parent / Guardian',
        'user'                 => 'User',
    ];
}

/** Human label for a role key (catalog label, then canonical map, then title-case). */
function roleLabel(string $role): string {
    $role = $role !== '' ? $role : 'user';
    $labels = algRoleLabels();
    if (isset($labels[$role])) return $labels[$role];
    try {
        $db = getDbConnection();
        if ($db) {
            $stmt = $db->prepare("SELECT label FROM roles WHERE `key` = :k AND deleted_at IS NULL ORDER BY org_id ASC LIMIT 1");
            $stmt->execute([':k' => $role]);
            $label = $stmt->fetchColumn();
            if ($label) return (string)$label;
        }
    } catch (\Throwable $e) {
        // fall through to title-case
    }
    return ucfirst(str_replace('_', ' ', $role));
}

/**
 * Normalize a users-table row into the canonical auth user payload
 * consumed by the frontend (matches the ALG Studio contract).
 */
/**
 * Resolve the campus' active academic year + term names for the auth payload.
 * Source of truth is the academic_years/terms tables; falls back to the default
 * session labels when a campus has not configured its academic calendar yet.
 */
function algActiveAcademicContext(int $orgId): array {
    $ctx = ['year' => '2026/2027', 'term' => 'Term 1'];
    try {
        $db = getDbConnection();
        $y = $db->prepare("SELECT name FROM academic_years WHERE org_id = :o AND status = 'active' AND deleted_at IS NULL LIMIT 1");
        $y->execute([':o' => $orgId]);
        $yn = (string)($y->fetchColumn() ?: '');
        if ($yn !== '') { $ctx['year'] = $yn; }

        $t = $db->prepare("SELECT t.name FROM terms t
                           INNER JOIN academic_years ty ON ty.id = t.year_id AND ty.deleted_at IS NULL
                           WHERE ty.org_id = :o AND t.status = 'active' AND t.deleted_at IS NULL LIMIT 1");
        $t->execute([':o' => $orgId]);
        $tn = (string)($t->fetchColumn() ?: '');
        if ($tn !== '') { $ctx['term'] = $tn; }
    } catch (\Throwable $e) {
        // Non-fatal: fall back to defaults.
    }
    return $ctx;
}

/**
 * Is this user teaching staff? Broader than the teacher/form_teacher RBAC role:
 * a school may classify an academic employee as faculty via their staff profile
 * or job title while keeping their own role key ('staff', etc.). The rule is
 * duplicated deliberately from api/teachers/_teachers_family.php so the auth
 * layer has no dependency on an api-folder include. Keep the two in sync.
 */
function algIsTeachingStaff(int $userId, string $role = ''): bool {
    if (in_array($role, ['teacher', 'form_teacher'], true)) return true;
    if ($userId <= 0) return false;
    try {
        $db = getDbConnection();
        $stmt = $db->prepare(
            "SELECT 1 FROM `users` u
             LEFT JOIN `staff_profiles` sp ON sp.user_id = u.id
             WHERE u.id = :id AND u.deleted_at IS NULL
               AND (
                    EXISTS (SELECT 1 FROM `teacher_profiles` tp WHERE tp.user_id = u.id AND tp.deleted_at IS NULL)
                    OR sp.staff_category = 'academic'
                    OR LOWER(sp.department) LIKE '%academic%'
                    OR LOWER(sp.job_title) LIKE '%teacher%'
                    OR LOWER(sp.job_title) LIKE '%instructor%'
                    OR LOWER(sp.job_title) LIKE '%faculty%'
                    OR LOWER(sp.job_title) LIKE '%educator%'
                    OR LOWER(sp.job_title) LIKE '%tutor%'
                    OR LOWER(sp.job_title) LIKE '%lecturer%'
                    OR LOWER(u.designation) LIKE '%teacher%'
                    OR LOWER(u.designation) LIKE '%instructor%'
                    OR LOWER(u.designation) LIKE '%faculty%'
                    OR LOWER(u.designation) LIKE '%educator%'
                    OR LOWER(u.designation) LIKE '%tutor%'
               )
             LIMIT 1"
        );
        $stmt->execute([':id' => $userId]);
        return (bool)$stmt->fetch();
    } catch (\Throwable $e) {
        // A missing profile table must never break authentication.
        return false;
    }
}

/**
 * Academic employees may use the RBAC role `staff` while actually teaching.
 * Their teaching identity comes from teacher profiles / form-teacher / subject
 * allocations, so merge the minimum teacher capability set into their effective
 * permissions without giving non-academic staff the same access.
 */
function algTeachingStaffEffectivePermissions(int $userId, string $role, array $permissions): array
{
    $role = strtolower($role);
    if (in_array($role, ['teacher', 'form_teacher'], true)) {
        $isTeaching = true;
    } elseif ($role === 'staff') {
        $isTeaching = algIsTeachingStaff($userId, $role);
    } else {
        return $permissions;
    }
    if (!$isTeaching) return $permissions;

    $grant = ['classes.mine', 'attendance.update', 'exams.view', 'exams.mine'];
    $seen = [];
    foreach (array_merge($permissions, $grant) as $key) $seen[(string)$key] = true;
    return array_keys($seen);
}

function buildAuthUserPayload(array $row, array $permissions = [], array $extraRoles = []): array {
    $role = $row['role'] ?? 'user';
    $orgName = $row['org_name'] ?? 'School OS';
    $extraRoles = array_values(array_unique(array_filter(array_map('strval', $extraRoles))));
    $effectiveRoles = array_values(array_unique(array_merge([$role], $extraRoles)));

    // Teaching-staff marker. The frontend uses this (never role alone) to choose
    // the teacher dashboard vs the staff operations dashboard, so an academic
    // employee whose RBAC role is 'staff' still lands on their teaching day.
    $isTeachingStaff = algIsTeachingStaff((int)($row['id'] ?? 0), $role);
    $permissions = algTeachingStaffEffectivePermissions((int)($row['id'] ?? 0), (string)$role, $permissions);

    // Form teacher marker & effective role: dynamically verify if appointed to any class arm
    $isFormTeacher = false;
    $dbFt = getDbConnection();
    if ($dbFt && !empty($row['id'])) {
        try {
            $ftStmt = $dbFt->prepare("SELECT id FROM classes WHERE form_teacher_id = :uid AND deleted_at IS NULL LIMIT 1");
            $ftStmt->execute([':uid' => (int)$row['id']]);
            if ($ftStmt->fetch()) {
                $isFormTeacher = true;
                if (!in_array('form_teacher', $effectiveRoles, true)) {
                    $effectiveRoles[] = 'form_teacher';
                }
            }
        } catch (\Exception $e) {}
    }

    // Plan & onboarding context (authoritative from DB). Columns come from the
    // auth endpoints' JOIN of organizations + plans (see login.php / me.php).
    $planCode   = $planCode ?? $row['org_plan_code'] ?? null;
    $planName   = $row['plan_name'] ?? null;
    $planModules = json_decode((string)($row['plan_modules'] ?? '[]'), true);
    $planFeatures = json_decode((string)($row['plan_features'] ?? '[]'), true);
    if (!is_array($planModules))  $planModules  = [];
    if (!is_array($planFeatures)) $planFeatures = [];
    $onboardingComplete = (bool)($row['org_onboarding_complete'] ?? false);

    $academic = algActiveAcademicContext((int)($row['org_id'] ?? 1));

    return [
        'id'            => (int)($row['id'] ?? 0),
        'org_id'        => (int)($row['org_id'] ?? 1),
        'name'          => $row['name'] ?? 'User',
        'email'         => $row['email'] ?? '',
        'phone'         => $row['phone'] ?? null,
        'avatar_url'    => $row['avatar_url'] ?? null,
        'role'          => $role,
        'role_label'    => roleLabel($role),
        'designation'   => $row['designation'] ?? null,
        'bio'           => $row['bio'] ?? null,
        'timezone'      => $row['timezone'] ?? 'UTC',
        'language'      => $row['language'] ?? 'en',
        'extra_roles'   => $extraRoles,
        'roles'         => $effectiveRoles,
        'is_teaching_staff' => $isTeachingStaff,
        'is_form_teacher'   => $isFormTeacher,
        'status'        => $row['status'] ?? 'active',
        'school'        => $orgName,
        'org_name'      => $orgName,
        'org_slug'      => $row['org_slug'] ?? null,
        'plan_code'          => $planCode,
        'onboarding_complete'=> $onboardingComplete,
        'plan'          => $planCode ? [
            'code'        => $planCode,
            'name'        => $planName,
            'modules'     => $planModules,
            'features'    => $planFeatures,
            'price'       => isset($row['plan_price']) ? (float)$row['plan_price'] : null,
            'currency'    => $row['plan_currency'] ?? 'NGN',
            'price_unit'  => $row['plan_price_unit'] ?? null,
        ] : null,
        'academic_year' => $academic['year'],
        'term'          => $academic['term'],
        // Per-campus education levels (own org seed; the shell refreshes to the
        // active campus via api/settings/school-levels.php on campus switch).
        'school_type'   => algOrgSchoolType(null, (int)($row['org_id'] ?? 1)),
        'school_levels' => algOrgSchoolLevels(null, (int)($row['org_id'] ?? 1)),
        'all_levels'    => ALG_SCHOOL_LEVELS,
        'permissions'   => $permissions,
    ];
}

// 10. Backward-Compatibility Aliases (alg-studio-api style)
function sendResponse(bool $success, string $message = '', $data = null, int $statusCode = 200) {
    if ($success) {
        sendSuccess($data, $message, $statusCode);
    } else {
        sendError($message, $statusCode ?: 400, $data);
    }
}

function logActivity(int $userId, string $action, string $description = '', int $orgId = 1) {
    \Alg\Audit\AuditLogger::log($action, null, null, null, ['description' => $description], $userId, $orgId);
}

