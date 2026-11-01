<?php
/**
 * RBAC Module — Permission Matrix
 * GET /api/rbac/permissions.php?catalog=1        full permission catalog grouped by module
 * GET /api/rbac/permissions.php?role=teacher     one role's effective permission set
 * GET /api/rbac/permissions.php?user_id=5        a user's roles + effective permissions
 * PUT /api/rbac/permissions.php                  save a role's matrix { role, permissions?[] , reset?, org_id? }
 *
 * School administrators edit a role's permissions *for their own school*: the
 * first save creates an org-scoped override of the system role, so other schools
 * are unaffected. Platform administrators editing at org 0 change the global
 * default. Passing reset=true removes an override and restores the default.
 */

require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/_rbac.php';

$db = requireDatabase(getDbConnection());
$user = verifyAuthToken();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    requirePermission('roles.view');
    handlePermissionsGet($db, $user);
}

if ($method === 'PUT' || $method === 'POST') {
    $adminId = requirePermission('roles.manage');
    handlePermissionsSave($db, $user, $adminId);
}

sendError("Method not allowed.", 405);

/* --------------------------------------------------------------------- GET */
function handlePermissionsGet($db, array $user): void {
    $catalog = rbacPermissionCatalog($db);
    $modules = rbacPermissionModules($catalog);

    if (!empty($_GET['catalog'])) {
        sendSuccess([
            'permissions_catalog' => $catalog,
            'permission_modules'  => $modules,
        ], "Permission catalog retrieved.");
    }

    if (!empty($_GET['user_id'])) {
        $targetId = (int)$_GET['user_id'];
        $stmt = $db->prepare("SELECT id, org_id, name, email, role FROM users WHERE id = :id AND deleted_at IS NULL LIMIT 1");
        $stmt->execute([':id' => $targetId]);
        $target = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$target) sendError("User not found.", 404, [], 'USER_NOT_FOUND');

        $orgId = (int)$target['org_id'];
        $isPlatform = isPlatformAdminRole($user['role'] ?? '');
        if (!$isPlatform && !canAccessOrgFamily($db, (int)($user['org_id'] ?? 0), $orgId)) {
            sendError("You cannot view users outside your school.", 403, [], 'FORBIDDEN_TENANT');
        }

        $base = (string)$target['role'];
        $extra = getUserExtraRoles($db, $targetId);
        $perms = fetchUserPermissions($db, $base, $orgId, $extra);

        sendSuccess([
            'user'        => [
                'id' => (int)$target['id'], 'name' => $target['name'], 'email' => $target['email'],
                'org_id' => $orgId, 'base_role' => $base, 'base_role_label' => roleLabel($base),
            ],
            'extra_roles' => array_map(function ($r) { return ['key' => $r, 'label' => roleLabel($r)]; }, $extra),
            'roles'       => getUserEffectiveRoles($db, $targetId, $base),
            'permissions' => $perms,
        ], "User permissions retrieved.");
    }

    $role = normalizeRoleKey((string)($_GET['role'] ?? ''));
    if ($role === '') sendError("A 'role' or 'user_id' is required.", 422, ['role' => 'Required'], 'VALIDATION_FAILED');

    $orgId = rbacTargetOrgFromRequest($db, $user);
    $row = rbacRoleRow($db, $orgId, $role);
    if (!$row) sendError("Role '{$role}' was not found.", 404, [], 'ROLE_NOT_FOUND');

    // Platform roles are invisible outside the global/platform scope.
    if (($row['scope'] ?? 'organization') === 'platform' && !isPlatformAdminRole($user['role'] ?? '')) {
        sendError("Platform roles can only be managed by ALG staff.", 403, [], 'ROLE_SYSTEM_READONLY');
    }

    $isSystem = (int)($row['is_system'] ?? 0) === 1;
    $customized = $orgId > 0 && (bool)rbacOrgRoleRow($db, $orgId, $role);
    $effective = resolveRolePermissionKeys($db, $role, $orgId);

    sendSuccess([
        'role'                => $role,
        'label'               => roleLabel($role),
        'scope'               => $row['scope'] ?? 'organization',
        'org_id'              => $orgId,
        'customized'          => $customized,
        'is_custom'           => !$isSystem,
        'can_edit_perms'      => !(($row['scope'] ?? 'organization') === 'platform' && !isPlatformAdminRole($user['role'] ?? '')),
        'permissions'         => $effective,
        'permissions_catalog' => $catalog,
        'permission_modules'  => $modules,
    ], "Role permissions retrieved.");
}

function rbacTargetOrgFromRequest($db, array $user): int {
    $requested = isset($_GET['org_id']) ? (int)$_GET['org_id'] : null;
    if ($requested !== null) {
        if (isPlatformAdminRole($user['role'] ?? '')) {
            return $requested > 0 ? resolveOrgFamilyRoot($db, $requested) : 0;
        }
        return resolveManagingRoot($db, $user);
    }
    return rbacManageOrg($db, $user);
}

/* --------------------------------------------------------------- SAVE (PUT) */
function handlePermissionsSave($db, array $user, int $adminId): void {
    $input = getJsonInput();
    $role = normalizeRoleKey((string)($input['role'] ?? ''));
    if ($role === '') sendError("A 'role' is required.", 422, ['role' => 'Required'], 'VALIDATION_FAILED');

    $orgId = rbacTargetOrgFromRequest($db, $user);
    $isPlatform = isPlatformAdminRole($user['role'] ?? '');
    $reset = !empty($input['reset']);

    $row = rbacRoleRow($db, $orgId, $role);
    if (!$row) sendError("Role '{$role}' was not found in this scope.", 404, [], 'ROLE_NOT_FOUND');

    $isPlatformScope = (($row['scope'] ?? 'organization') === 'platform');
    if ($isPlatformScope && !$isPlatform) {
        sendError("Platform roles can only be managed by ALG staff.", 403, [], 'ROLE_SYSTEM_READONLY');
    }
    if ($orgId <= 0 && !$isPlatform) {
        sendError("You are not permitted to edit platform defaults.", 403, [], 'FORBIDDEN_TENANT');
    }

    try {
        $db->beginTransaction();

        if ($reset) {
            // Remove a per-school override and fall back to the system default.
            if ($orgId > 0 && (int)($row['is_system'] ?? 0) === 1) {
                $db->prepare("DELETE FROM role_permissions WHERE org_id = :org AND role = :role")->execute([':org' => $orgId, ':role' => $role]);
                $db->prepare("DELETE FROM roles WHERE org_id = :org AND `key` = :role")->execute([':org' => $orgId, ':role' => $role]);
            }
            $db->commit();

            \Alg\Audit\AuditLogger::log('rbac.role_permissions_reset', 'role', null, null, [
                'role' => $role, 'org_id' => $orgId,
            ], $adminId, (int)($user['org_id'] ?? 0));

            $effective = resolveRolePermissionKeys($db, $role, $orgId);
            sendSuccess(['role' => $role, 'org_id' => $orgId, 'permissions' => $effective, 'customized' => false],
                "Role '{$role}' reset to the default permissions.");
        }

        if (!is_array($input['permissions'] ?? null)) {
            sendError("A 'permissions' array is required.", 422, ['permissions' => 'Required'], 'VALIDATION_FAILED');
        }

        // Editing a system role for a specific school: materialise an org-scoped
        // override row so resolution treats the org matrix as authoritative.
        if ($orgId > 0 && !rbacOrgRoleRow($db, $orgId, $role)) {
            $sys = rbacSystemRoleRow($db, $role);
            if ($sys) {
                $up = $db->prepare("
                    INSERT INTO roles (org_id, `key`, label, description, scope, is_system, is_assignable, is_default, wildcard, sort_order, created_by)
                    VALUES (:org, :k, :label, :descr, 'organization', 1, :assignable, 0, 0, :sort, :by)
                    ON DUPLICATE KEY UPDATE updated_at = NOW()
                ");
                $up->execute([
                    ':org' => $orgId, ':k' => $role,
                    ':label' => $sys['label'], ':descr' => $sys['description'],
                    ':assignable' => (int)($sys['is_assignable'] ?? 1),
                    ':sort' => (int)($sys['sort_order'] ?? 100),
                    ':by' => $adminId,
                ]);
            }
        }

        rbacReplaceRolePermissions($db, $orgId, $role, $input['permissions']);
        $db->commit();

        \Alg\Audit\AuditLogger::log('rbac.role_permissions_updated', 'role', null, null, [
            'role' => $role, 'org_id' => $orgId, 'count' => count($input['permissions']),
        ], $adminId, (int)($user['org_id'] ?? 0));

        $effective = resolveRolePermissionKeys($db, $role, $orgId);
        sendSuccess([
            'role'        => $role,
            'org_id'      => $orgId,
            'permissions' => $effective,
            'customized'  => $orgId > 0,
        ], "Permissions for '{$role}' saved.");
    } catch (\Throwable $e) {
        if ($db->inTransaction()) $db->rollBack();
        sendError("Could not save permissions: " . $e->getMessage(), 500, [], 'PERMISSIONS_SAVE_FAILED');
    }
}
