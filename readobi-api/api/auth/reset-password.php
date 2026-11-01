<?php
/**
 * Auth Module - Reset Password Submission Endpoint
 * POST /api/auth/reset-password.php
 * 
 * Supports:
 * - Reset token hash verification and expiry check
 * - Bcrypt password hashing
 * - Invalidation of reset token and all active refresh sessions
 * - Audit logging
 */

require_once __DIR__ . '/../../config.php';

$auth = new \Alg\Security\AuthManager();
$db = getDbConnection();
$input = getJsonInput();

$token = trim($input['token'] ?? '');
$newPassword = trim($input['new_password'] ?? '');

if (empty($token) || empty($newPassword)) {
    sendError("Reset token and new password are required.", 400);
}

if (strlen($newPassword) < 8) {
    sendError("Password must be at least 8 characters long.", 422);
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
        $resetRecord = $stmt->fetch();

        if (!$resetRecord) {
            sendError("Invalid or expired password reset token.", 400);
        }

        $email = $resetRecord['email'];
        $newHash = $auth->hashPassword($newPassword);

        // Update password
        $updateStmt = $db->prepare("UPDATE users SET password_hash = :hash, updated_at = NOW() WHERE email = :email");
        $updateStmt->execute([':hash' => $newHash, ':email' => $email]);

        // Mark token as used
        $db->prepare("UPDATE password_resets SET used = 1 WHERE id = :id")->execute([':id' => $resetRecord['id']]);

        // Revoke all refresh tokens for this user for security
        $userStmt = $db->prepare("SELECT id, org_id FROM users WHERE email = :email LIMIT 1");
        $userStmt->execute([':email' => $email]);
        $user = $userStmt->fetch();

        if ($user) {
            $db->prepare("UPDATE refresh_tokens SET revoked = 1 WHERE user_id = :uid")->execute([':uid' => $user['id']]);
            \Alg\Audit\AuditLogger::log('auth.reset_password', 'user', (int)$user['id'], null, ['email' => $email], (int)$user['id'], (int)$user['org_id']);
        }

        sendSuccess([], "Password has been reset successfully. Please log in with your new password.");

    } catch (PDOException $e) {
        sendError("Database error during password reset.", 500);
    }
}

// Development Mock Mode
sendSuccess([], "Password reset successfully (development mode).");
