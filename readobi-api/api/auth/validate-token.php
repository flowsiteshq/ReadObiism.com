<?php
/**
 * Auth Module - Token Validation Endpoint
 * GET|POST /api/auth/validate-token.php
 *
 * Verifies a Bearer JWT, confirms the referenced user still exists and is
 * active, and returns the authoritative user + RBAC payload.
 */

require_once __DIR__ . '/../../config.php';

$currentUser = verifyAuthToken();
$db = requireDatabase(getDbConnection());

try {
    $stmt = $db->prepare("
        SELECT u.*, o.name AS org_name, o.slug AS org_slug, o.logo_url AS org_logo,
               o.plan_code AS org_plan_code, o.onboarding_complete AS org_onboarding_complete,
               p.name AS plan_name, p.modules AS plan_modules, p.features AS plan_features,
               p.price AS plan_price, p.currency AS plan_currency, p.price_unit AS plan_price_unit
        FROM users u
        LEFT JOIN organizations o ON o.id = u.org_id
        LEFT JOIN plans p ON p.code = o.plan_code
        WHERE u.id = :id AND u.deleted_at IS NULL
        LIMIT 1
    ");
    $stmt->execute([':id' => (int)$currentUser['id']]);
    $row = $stmt->fetch();

    if (!$row) {
        sendError("Your session is no longer valid. Please sign in again.", 401, [], 'AUTH_USER_NOT_FOUND');
    }

    if (($row['status'] ?? 'active') !== 'active') {
        sendError("Your account is not active. Please contact your administrator.", 403, [], 'AUTH_ACCOUNT_INACTIVE');
    }

    $permissions = fetchUserPermissions($db, $row['role']);
    $userData = buildAuthUserPayload($row, $permissions);
    $userData['organization'] = [
        'id'       => (int)$row['org_id'],
        'name'     => $row['org_name'] ?? 'School OS',
        'slug'     => $row['org_slug'] ?? 'school-os',
        'logo_url' => $row['org_logo'] ?? null,
        'plan_code'          => $row['org_plan_code'] ?? null,
        'onboarding_complete'=> (bool)($row['org_onboarding_complete'] ?? false),
    ];

    sendSuccess(['user' => $userData], "Token is valid");

} catch (PDOException $e) {
    sendError("Token validation service error. Please try again.", 500);
}
