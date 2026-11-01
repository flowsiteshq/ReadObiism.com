<?php
/**
 * Auth Module - Request One-Time Passcode (OTP) Endpoint
 * POST /api/auth/otp-request.php
 * 
 * Supports:
 * - Generates 6-digit expiring numeric OTP
 * - Dispatches code via transactional email (or SMS provider)
 * - 10-minute expiry window
 */

require_once __DIR__ . '/../../config.php';

$auth = new \Alg\Security\AuthManager();
$mailer = new \Alg\Mail\Mailer();
$db = getDbConnection();
$input = getJsonInput();

$email = trim($input['email'] ?? '');
$purpose = trim($input['purpose'] ?? 'login_2fa');

// Rate limiting: Max 3 OTP requests per 10 minutes per IP
\Alg\Security\RateLimiter::check('otp_request', 3, 600);

if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    sendError("Valid email address is required.", 422);
}

$userId = 1;
$userName = 'User';

if ($db) {
    try {
        $stmt = $db->prepare("SELECT id, name FROM users WHERE email = :email AND deleted_at IS NULL LIMIT 1");
        $stmt->execute([':email' => $email]);
        $user = $stmt->fetch();
        if ($user) {
            $userId = (int)$user['id'];
            $userName = $user['name'];
        }
    } catch (PDOException $e) {}
}

$otpCode = $auth->generateOtp($userId, $purpose);

// Dispatch OTP Email
$mailer->sendTemplate($email, "Your Verification Code - " . Config::get('app_name', 'ALG Studio'), 'otp-code', [
    'name'            => $userName,
    'app_name'        => Config::get('app_name', 'ALG Studio'),
    'otp_code'        => $otpCode,
    'expires_minutes' => 10
]);

\Alg\Audit\AuditLogger::log('auth.otp_requested', 'user', $userId, null, ['email' => $email, 'purpose' => $purpose]);

sendSuccess([
    'email'           => $email,
    'purpose'         => $purpose,
    'expires_minutes' => 10
], "A 6-digit verification code has been sent to your email.");
