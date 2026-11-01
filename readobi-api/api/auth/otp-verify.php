<?php
/**
 * Auth Module - Verify One-Time Passcode (OTP) Endpoint
 * POST /api/auth/otp-verify.php
 * 
 * Supports:
 * - 6-digit OTP verification
 * - One-time use enforcement
 * - Issues full session JWT on successful verification
 */

require_once __DIR__ . '/../../config.php';

$auth = new \Alg\Security\AuthManager();
$db = getDbConnection();
$input = getJsonInput();

$email = trim($input['email'] ?? '');
$code = trim($input['code'] ?? '');
$purpose = trim($input['purpose'] ?? 'login_2fa');

// Brute-force protection: Max 5 attempts per 10 minutes
\Alg\Security\RateLimiter::check('otp_verify', 5, 600);

if (empty($email) || empty($code)) {
    sendError("Email and 6-digit OTP code are required.", 400);
}

$userId = 1;
$role = 'user';
$orgId = 1;

if ($db) {
    try {
        $stmt = $db->prepare("SELECT id, role, org_id FROM users WHERE email = :email AND deleted_at IS NULL LIMIT 1");
        $stmt->execute([':email' => $email]);
        $user = $stmt->fetch();
        if ($user) {
            $userId = (int)$user['id'];
            $role = $user['role'];
            $orgId = (int)$user['org_id'];
        }
    } catch (PDOException $e) {}
}

$verified = $auth->verifyOtp($userId, $code, $purpose);

if (!$verified) {
    sendError("Invalid or expired OTP code. Please request a new one.", 401);
}

// Issue tokens
$accessToken = $auth->generateAccessToken($userId, $role, $orgId);
$refreshToken = $auth->generateRefreshToken($userId, $orgId);

\Alg\Audit\AuditLogger::log('auth.otp_verified', 'user', $userId, null, ['email' => $email, 'purpose' => $purpose], $userId, $orgId);

sendSuccess([
    'verified'      => true,
    'access_token'  => $accessToken,
    'refresh_token' => $refreshToken,
    'token_type'    => 'Bearer'
], "Code verified successfully.");
