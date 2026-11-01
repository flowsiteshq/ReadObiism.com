<?php
/**
 * Auth Module - Email Verification Endpoint
 * POST /api/auth/verify-email.php (or GET with ?token=...)
 * 
 * Supports:
 * - Email confirmation token verification
 * - Updating email_verified_at timestamp
 * - Account activation confirmation
 */

require_once __DIR__ . '/../../config.php';

$db = getDbConnection();
$input = getJsonInput();
$token = trim($input['token'] ?? $_GET['token'] ?? '');

if (empty($token)) {
    sendError("Verification token is required.", 400);
}

if ($db) {
    try {
        $tokenHash = hash('sha256', $token);
        $stmt = $db->prepare("
            SELECT id, email FROM password_resets
            WHERE token = :token AND used = 0 AND expires_at > NOW()
            ORDER BY id DESC LIMIT 1
        ");
        $stmt->execute([':token' => $tokenHash]);
        $record = $stmt->fetch();

        if (!$record) {
            sendError("Invalid or expired verification token.", 400);
        }

        // Update user status
        $db->prepare("UPDATE users SET email_verified_at = NOW(), status = 'active' WHERE email = :email")
           ->execute([':email' => $record['email']]);

        // Mark token as used
        $db->prepare("UPDATE password_resets SET used = 1 WHERE id = :id")->execute([':id' => $record['id']]);

        \Alg\Audit\AuditLogger::log('auth.email_verified', 'user', null, null, ['email' => $record['email']]);

        sendSuccess(['email' => $record['email']], "Email address verified successfully. Your account is fully active.");

    } catch (PDOException $e) {
        sendError("Database error during verification.", 500);
    }
}

sendSuccess([], "Email address verified successfully (development mode).");
