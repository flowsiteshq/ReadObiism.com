<?php
/**
 * Auth Module - Forgot Password Request Endpoint
 * POST /api/auth/forgot-password.php
 * 
 * Supports:
 * - Secure cryptographic token generation (64 hex characters)
 * - Expiration handling (1 hour validity)
 * - Reset email dispatch with template interpolation
 * - Enumeration-safe responses (returns success even if email not found)
 */

require_once __DIR__ . '/../../config.php';

$mailer = new \Alg\Mail\Mailer();
$db = getDbConnection();
$input = getJsonInput();

$email = trim($input['email'] ?? '');

// Rate limiting: Max 5 password reset requests per 15 minutes per IP
\Alg\Security\RateLimiter::check('forgot_password', 5, 900);

if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    sendError("Please provide a valid email address.", 422);
}

$resetToken = bin2hex(random_bytes(32));
$expiresMinutes = 60;

if ($db) {
    try {
        $stmt = $db->prepare("SELECT id, name FROM users WHERE email = :email AND deleted_at IS NULL LIMIT 1");
        $stmt->execute([':email' => $email]);
        $user = $stmt->fetch();

        if ($user) {
            $resetStmt = $db->prepare("
                INSERT INTO password_resets (email, token, expires_at, created_at)
                VALUES (:email, :token, DATE_ADD(NOW(), INTERVAL :expires MINUTE), NOW())
            ");
            $resetStmt->execute([
                ':email'   => $email,
                ':token'   => hash('sha256', $resetToken),
                ':expires' => $expiresMinutes
            ]);

            $resetUrl = Config::get('app_url', 'http://localhost') . "/alg-company-frontend-boilerplate/dashboard/reset-password.html?token=" . $resetToken;

            // Dispatch Reset Email
            $mailer->sendTemplate($email, "Password Reset Request - " . Config::get('app_name', 'ALG Studio'), 'reset-password', [
                'name'            => $user['name'],
                'app_name'        => Config::get('app_name', 'ALG Studio'),
                'reset_url'       => $resetUrl,
                'expires_minutes' => $expiresMinutes
            ]);

            \Alg\Audit\AuditLogger::log('auth.forgot_password', 'user', (int)$user['id'], null, ['email' => $email]);
        }
    } catch (PDOException $e) {
        // Fall through safely
    }
}

sendSuccess([
    'email'           => $email,
    'expires_minutes' => $expiresMinutes
], "If an account exists with this email address, password reset instructions have been sent.");
