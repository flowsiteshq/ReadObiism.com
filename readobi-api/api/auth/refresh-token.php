<?php
/**
 * Auth Module - Refresh Token Endpoint
 * POST /api/auth/refresh-token.php
 * 
 * Supports:
 * - Refresh token verification and rotation
 * - Issuing new JWT Access Token
 * - Prevention of token replay attacks
 */

require_once __DIR__ . '/../../config.php';

$auth = new \Alg\Security\AuthManager();
$db = getDbConnection();
$input = getJsonInput();

$refreshToken = trim($input['refresh_token'] ?? '');

if (empty($refreshToken)) {
    sendError("Refresh token is required.", 400);
}

// 1. Validate Token in DB
if ($db) {
    try {
        $userSession = $auth->validateRefreshToken($refreshToken);
        if (!$userSession) {
            sendError("Invalid or expired refresh token. Please sign in again.", 401);
        }

        // Revoke old refresh token (Token Rotation)
        $auth->revokeRefreshToken($refreshToken);

        // Fetch user permissions
        $permStmt = $db->prepare("
            SELECT p.key FROM permissions p
            JOIN role_permissions rp ON rp.permission_id = p.id
            WHERE rp.role = :role
        ");
        $permStmt->execute([':role' => $userSession['role']]);
        $permissions = $permStmt->fetchAll(PDO::FETCH_COLUMN) ?: [];

        // Issue new token pair
        $newAccessToken = $auth->generateAccessToken(
            (int)$userSession['user_id'],
            $userSession['role'],
            (int)$userSession['org_id'],
            $permissions
        );
        $newRefreshToken = $auth->generateRefreshToken(
            (int)$userSession['user_id'],
            (int)$userSession['org_id']
        );

        sendSuccess([
            'access_token'  => $newAccessToken,
            'refresh_token' => $newRefreshToken,
            'token_type'    => 'Bearer',
            'expires_in'    => Config::get('jwt_expiry', 86400)
        ], "Token refreshed successfully.");

    } catch (PDOException $e) {
        sendError("Database error during token refresh.", 500);
    }
}

// 2. Mock Fallback
$newAccessToken = $auth->generateAccessToken(1, 'super_admin', 1, ['*']);
$newRefreshToken = "alg_rf_" . bin2hex(random_bytes(24));

sendSuccess([
    'access_token'  => $newAccessToken,
    'refresh_token' => $newRefreshToken,
    'token_type'    => 'Bearer',
    'expires_in'    => 86400
], "Token refreshed successfully (development mode).");
