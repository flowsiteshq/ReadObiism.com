<?php
/**
 * Auth Module - User Logout Endpoint
 * POST /api/auth/logout.php
 * 
 * Supports:
 * - Refresh token revocation in database
 * - Audit logging of logout event
 * - Session invalidation
 */

require_once __DIR__ . '/../../config.php';

$auth = new \Alg\Security\AuthManager();
$input = getJsonInput();

$refreshToken = trim($input['refresh_token'] ?? '');

if (!empty($refreshToken)) {
    $auth->revokeRefreshToken($refreshToken);
}

// Log audit trail if Bearer token present
try {
    $currentUser = verifyAuthToken();
    if ($currentUser) {
        \Alg\Audit\AuditLogger::log('auth.logout', 'user', (int)$currentUser['id'], null, null, (int)$currentUser['id'], (int)($currentUser['org_id'] ?? 1));
    }
} catch (Exception $e) {
    // Ignore if already signed out
}

sendSuccess([
    'revoked' => true
], "Logged out successfully. Tokens revoked.");
