<?php
/**
 * RBAC Module — Assign Roles to a User
 * POST /api/rbac/assign.php
 *
 * Body:
 *   { user_id, role }                  set the user's BASE role
 *   { user_id, roles: [r1, r2, ...] }  set base = roles[0] and extras = the rest
 *   { user_id, action: 'assign',   role }   add an extra role
 *   { user_id, action: 'unassign', role }   remove an extra role
 *
 * Effective permissions are the union of the base role (users.role) and any
 * extra roles (user_roles) — mirroring the ALG Studio staff RBAC reference.
 */

require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/_rbac.php';

$adminId = requirePermission('users.roles.assign');
$currentUser = verifyAuthToken();
$db = requireDatabase(getDbConnection());

$input = getJsonInput();
$targetUserId = (int)($input['user_id'] ?? 0);
$action = strtolower(trim((string)($input['action'] ?? 'set')));

if ($targetUserId <= 0) {
    sendError("Valid target 'user_id' is required.", 400, [], 'VALIDATION_FAILED');
}

// The primary system administrator is protected from alteration.
if ($targetUserId === 1 && (int)$currentUser['id'] !== 1) {
    sendError("Access denied: The primary system administrator cannot be modified.", 403);
}

$stmt = $db->prepare("SELECT id, org_id, name, email, role FROM users WHERE id = :id AND deleted_at IS NULL LIMIT 1");
$stmt->execute([':id' => $targetUserId]);
$target = $stmt->fetch(PDO::FETCH_ASSOC);
if (!$target) sendError("User not found.", 404, [], 'USER_NOT_FOUND');

$isPlatform = isPlatformAdminRole($currentUser['role'] ?? '');
if (!$isPlatform && !canAccessOrgFamily($db, (int)($currentUser['org_id'] ?? 0), (int)$target['org_id'])) {
    sendError("You cannot manage users outside your school.", 403, [], 'FORBIDDEN_TENANT');
}

/** Validate the role keys a caller wants to hand out. */
function validateAssignable($db, array $currentUser, array $keys): array {
    $clean = [];
    foreach ($keys as $k) {
        $k = normalizeRoleKey((string)$k);
        if ($k === '') continue;
        if (!rbacCanAssign($db, $currentUser, $k)) {
            sendError("You are not permitted to assign the '{$k}' role.", 403, [
                'role' => $k,
                'caller_role' => $currentUser['role'] ?? 'user',
            ], 'PRIVILEGE_ESCALATION');
        }
        $clean[$k] = true;
    }
    return array_keys($clean);
}

$baseRole = (string)$target['role'];
$extra = getUserExtraRoles($db, $targetUserId);

try {
    $db->beginTransaction();

    if ($action === 'assign') {
        $role = normalizeRoleKey((string)($input['role'] ?? ''));
        if ($role === '') sendError("A 'role' is required.", 422, ['role' => 'Required'], 'VALIDATION_FAILED');
        validateAssignable($db, $currentUser, [$role]);
        if ($role !== $baseRole && !in_array($role, $extra, true)) {
            $ins = $db->prepare("INSERT IGNORE INTO user_roles (user_id, org_id, role, assigned_by) VALUES (:uid, :org, :role, :by)");
            $ins->execute([':uid' => $targetUserId, ':org' => (int)$target['org_id'], ':role' => $role, ':by' => $adminId]);
            $extra[] = $role;
        }
    } elseif ($action === 'unassign') {
        $role = normalizeRoleKey((string)($input['role'] ?? ''));
        if ($role === '') sendError("A 'role' is required.", 422, ['role' => 'Required'], 'VALIDATION_FAILED');
        if ($role === $baseRole) {
            sendError("'{$role}' is this user's base role. Set a different base role first.", 422, [], 'ROLE_IS_BASE');
        }
        $db->prepare("DELETE FROM user_roles WHERE user_id = :uid AND role = :role")
           ->execute([':uid' => $targetUserId, ':role' => $role]);
        $extra = array_values(array_filter($extra, fn($r) => $r !== $role));
    } elseif (isset($input['roles']) && is_array($input['roles'])) {
        $roles = validateAssignable($db, $currentUser, $input['roles']);
        if (empty($roles)) sendError("At least one role is required.", 422, ['roles' => 'Required'], 'VALIDATION_FAILED');
        $baseRole = $roles[0];
        $extra = array_slice($roles, 1);

        $db->prepare("UPDATE users SET role = :role, updated_at = NOW() WHERE id = :id")
           ->execute([':role' => $baseRole, ':id' => $targetUserId]);
        $db->prepare("DELETE FROM user_roles WHERE user_id = :uid")->execute([':uid' => $targetUserId]);
        $ins = $db->prepare("INSERT IGNORE INTO user_roles (user_id, org_id, role, assigned_by) VALUES (:uid, :org, :role, :by)");
        foreach ($extra as $r) {
            $ins->execute([':uid' => $targetUserId, ':org' => (int)$target['org_id'], ':role' => $r, ':by' => $adminId]);
        }
    } else {
        // Legacy: set the base role only.
        $newRole = normalizeRoleKey((string)($input['role'] ?? ''));
        if ($newRole === '') sendError("A 'role' is required.", 422, ['role' => 'Required'], 'VALIDATION_FAILED');
        validateAssignable($db, $currentUser, [$newRole]);
        if ($newRole === $baseRole) {
            // no-op
        } else {
            $extra = array_values(array_filter($extra, fn($r) => $r !== $newRole));
            $db->prepare("DELETE FROM user_roles WHERE user_id = :uid AND role = :role")
               ->execute([':uid' => $targetUserId, ':role' => $newRole]);
        }
        $baseRole = $newRole;
        $db->prepare("UPDATE users SET role = :role, updated_at = NOW() WHERE id = :id")
           ->execute([':role' => $baseRole, ':id' => $targetUserId]);
    }

    $db->commit();
} catch (\Throwable $e) {
    if ($db->inTransaction()) $db->rollBack();
    // sendError() exits, so a validation failure inside the transaction would
    // already have terminated the request; anything reaching here is a DB error.
    sendError("Could not update roles: " . $e->getMessage(), 500, [], 'ROLE_ASSIGN_FAILED');
}

$baseRole = (string)$baseRole;
$extra = array_values(array_unique(array_filter($extra, fn($r) => $r !== $baseRole)));
$permissions = fetchUserPermissions($db, $baseRole, (int)$target['org_id'], $extra);

\Alg\Audit\AuditLogger::log('rbac.roles_assigned', 'user', $targetUserId, null, [
    'base_role'   => $baseRole,
    'extra_roles' => $extra,
], $adminId, (int)($currentUser['org_id'] ?? 0));

sendSuccess([
    'user_id'     => $targetUserId,
    'role'        => $baseRole,
    'roles'       => array_values(array_merge([$baseRole], $extra)),
    'extra_roles' => $extra,
    'permissions' => $permissions,
], "Roles updated successfully.");
