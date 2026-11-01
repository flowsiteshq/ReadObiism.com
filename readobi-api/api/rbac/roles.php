<?php
/**
 * RBAC Module — Role Catalog
 * GET    /api/rbac/roles.php           list roles (+ permission catalog) for the caller's scope
 * GET    /api/rbac/roles.php?mine=1    the caller's own effective roles + permissions
 * POST   /api/rbac/roles.php           create a role  { label, key?, description?, is_assignable?, permissions?[] }
 * PUT    /api/rbac/roles.php           update a custom role { key, label?, description?, is_assignable?, sort_order?, new_key? }
 * DELETE /api/rbac/roles.php?key=      delete a custom role (reassigns its users to 'staff')
 *
 * Roles are stored in `roles` (org_id 0 = platform/system; >0 = a school's
 * custom role or per-school override of a system role). The role -> permission
 * matrix lives in `role_permissions`, scoped by the same org id.
 */

require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/_rbac.php';

$db = requireDatabase(getDbConnection());
$user = verifyAuthToken();
$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        handleRolesGet($db, $user);
        break;
    case 'POST':
        handleRolesCreate($db, $user);
        break;
    case 'PUT':
        handleRolesUpdate($db, $user);
        break;
    case 'DELETE':
        handleRolesDelete($db, $user);
        break;
    default:
        sendError("Method not allowed.", 405);
}

function rbacTargetOrg($db, array $user, ?int $requested = null): int {
    if ($requested !== null) {
        if (isPlatformAdminRole($user['role'] ?? '')) {
            return $requested > 0 ? resolveOrgFamilyRoot($db, $requested) : 0;
        }
        // School users may only ever target their own family root.
        return resolveManagingRoot($db, $user);
    }
    return rbacManageOrg($db, $user);
}

/* --------------------------------------------------------------------- GET */
function handleRolesGet($db, array $user): void {
    requirePermission('roles.view');

    if (!empty($_GET['mine'])) {
        $base = (string)($user['role'] ?? 'user');
        $extra = getUserExtraRoles($db, (int)$user['id']);
        sendSuccess([
            'base_role'    => $base,
            'extra_roles'  => $extra,
            'roles'        => getUserEffectiveRoles($db, (int)$user['id'], $base),
            'permissions'  => $user['permissions'] ?? [],
        ], "Effective roles and permissions retrieved.");
    }

    $requested = isset($_GET['org_id']) ? (int)$_GET['org_id'] : null;
    $orgId = rbacTargetOrg($db, $user, $requested);
    rbacSendRoles($db, $user, $orgId, "ALG School OS role catalog retrieved successfully.");
}

/* -------------------------------------------------------------------- POST */
function handleRolesCreate($db, array $user): void {
    $adminId = requirePermission('roles.manage');
    $input = getJsonInput();

    $orgId = rbacTargetOrg($db, $user);
    $isPlatform = isPlatformAdminRole($user['role'] ?? '');

    $label = trim((string)($input['label'] ?? ''));
    $rawKey = trim((string)($input['key'] ?? ''));
    $key = normalizeRoleKey($rawKey !== '' ? $rawKey : $label);
    $description = trim((string)($input['description'] ?? ''));
    $scope = $orgId === 0 ? (($input['scope'] ?? 'organization') === 'platform' ? 'platform' : 'organization') : 'organization';

    if ($label === '')  sendError("A role name is required.", 422, ['label' => 'Required'], 'VALIDATION_FAILED');
    if ($key === '')    sendError("A valid role key is required.", 422, ['key' => 'Required'], 'VALIDATION_FAILED');
    if (!$isPlatform && $orgId <= 0) {
        sendError("You are not permitted to create platform roles.", 403);
    }

    // Custom roles may not shadow a built-in role key.
    if (rbacSystemRoleRow($db, $key)) {
        sendError("'{$key}' matches a built-in role. Edit its permissions instead of creating a duplicate.", 409, [], 'ROLE_KEY_TAKEN');
    }
    $existing = $db->prepare("SELECT id FROM roles WHERE org_id = :org AND `key` = :k AND deleted_at IS NULL LIMIT 1");
    $existing->execute([':org' => $orgId, ':k' => $key]);
    if ($existing->fetchColumn()) {
        sendError("A role with the key '{$key}' already exists.", 409, [], 'ROLE_KEY_TAKEN');
    }

    try {
        $db->beginTransaction();
        $stmt = $db->prepare("
            INSERT INTO roles (org_id, `key`, label, description, scope, is_system, is_assignable, is_default, wildcard, sort_order, created_by)
            VALUES (:org, :k, :label, :descr, :scope, 0, :assignable, 0, 0, 200, :by)
        ");
        $stmt->execute([
            ':org'        => $orgId,
            ':k'          => $key,
            ':label'      => $label,
            ':descr'      => $description !== '' ? $description : null,
            ':scope'      => $scope,
            ':assignable' => isset($input['is_assignable']) ? ((int)$input['is_assignable'] ? 1 : 0) : 1,
            ':by'         => $adminId,
        ]);
        $roleId = (int)$db->lastInsertId();

        $keys = is_array($input['permissions'] ?? null) ? $input['permissions'] : [];
        rbacReplaceRolePermissions($db, $orgId, $key, $keys);

        $db->commit();

        \Alg\Audit\AuditLogger::log('rbac.role_created', 'role', $roleId, null, [
            'role' => $key, 'org_id' => $orgId, 'scope' => $scope,
        ], $adminId, (int)($user['org_id'] ?? 0));

        $row = rbacOrgRoleRow($db, $orgId, $key) ?: rbacSystemRoleRow($db, $key);
        $payload = null;
        if ($row) {
            $payload = rbacRolePayload($db, $row, $orgId, null, false, $orgId > 0);
        }
        sendSuccess(['role' => $payload], "Role '{$label}' created successfully.", 201);
    } catch (\Throwable $e) {
        if ($db->inTransaction()) $db->rollBack();
        sendError("Could not create the role: " . $e->getMessage(), 500, [], 'ROLE_CREATE_FAILED');
    }
}

/* --------------------------------------------------------- PUT (update role) */
function handleRolesUpdate($db, array $user): void {
    $adminId = requirePermission('roles.manage');
    $input = getJsonInput();

    $key = normalizeRoleKey((string)($input['key'] ?? ''));
    if ($key === '') sendError("A role 'key' is required.", 422, ['key' => 'Required'], 'VALIDATION_FAILED');

    $requested = isset($input['org_id']) ? (int)$input['org_id'] : null;
    $orgId = rbacTargetOrg($db, $user, $requested);
    $isPlatform = isPlatformAdminRole($user['role'] ?? '');

    $row = $orgId > 0 ? rbacOrgRoleRow($db, $orgId, $key) : null;
    if (!$row && $orgId === 0 && $isPlatform) $row = rbacSystemRoleRow($db, $key);
    if (!$row) sendError("Role '{$key}' was not found in this scope.", 404, [], 'ROLE_NOT_FOUND');

    $isSystem = (int)($row['is_system'] ?? 0) === 1;
    if ($isSystem && !$isPlatform) {
        sendError("Built-in roles cannot be renamed or removed. You may edit their permissions instead.", 403, [], 'ROLE_SYSTEM_READONLY');
    }

    $label = isset($input['label']) ? trim((string)$input['label']) : (string)$row['label'];
    if ($label === '') sendError("A role name is required.", 422, ['label' => 'Required'], 'VALIDATION_FAILED');
    $description = array_key_exists('description', $input) ? trim((string)$input['description']) : ($row['description'] ?? null);
    $assignable = array_key_exists('is_assignable', $input) ? ((int)$input['is_assignable'] ? 1 : 0) : (int)($row['is_assignable'] ?? 1);
    $sortOrder = array_key_exists('sort_order', $input) ? (int)$input['sort_order'] : (int)($row['sort_order'] ?? 100);
    $newKey = isset($input['new_key']) ? normalizeRoleKey((string)$input['new_key']) : '';

    try {
        $db->beginTransaction();

        if ($newKey !== '' && $newKey !== $key) {
            if ($isSystem) {
                throw new \RuntimeException("Built-in role keys cannot be changed.");
            }
            if (rbacSystemRoleRow($db, $newKey) || ($orgId > 0 && rbacOrgRoleRow($db, $orgId, $newKey))) {
                throw new \RuntimeException("The role key '{$newKey}' is already in use.");
            }
            $db->prepare("UPDATE roles SET `key` = :nk WHERE id = :id")->execute([':nk' => $newKey, ':id' => (int)$row['id']]);
            $db->prepare("UPDATE role_permissions SET role = :nk WHERE org_id = :org AND role = :rk")->execute([':nk' => $newKey, ':org' => $orgId, ':rk' => $key]);
            $db->prepare("UPDATE user_roles SET role = :nk WHERE role = :rk")->execute([':nk' => $newKey, ':rk' => $key]);
            if ($orgId > 0) {
                $family = rbacFamilyOrgIds($db, $orgId);
                $in = implode(',', array_map('intval', $family ?: [$orgId]));
                $db->exec("UPDATE users SET role = " . $db->quote($newKey) . " WHERE role = " . $db->quote($key) . " AND org_id IN ($in)");
            }
            $key = $newKey;
        }

        $upd = $db->prepare("UPDATE roles SET label = :label, description = :descr, is_assignable = :assignable, sort_order = :sort WHERE id = :id");
        $upd->execute([
            ':label'      => $label,
            ':descr'      => ($description !== '' && $description !== null) ? $description : null,
            ':assignable' => $assignable,
            ':sort'       => $sortOrder,
            ':id'         => (int)$row['id'],
        ]);

        if (is_array($input['permissions'] ?? null)) {
            rbacReplaceRolePermissions($db, $orgId, $key, $input['permissions']);
        }

        $db->commit();

        \Alg\Audit\AuditLogger::log('rbac.role_updated', 'role', (int)$row['id'], null, [
            'role' => $key, 'org_id' => $orgId,
        ], $adminId, (int)($user['org_id'] ?? 0));

        $fresh = rbacRoleRow($db, $orgId, $key);
        sendSuccess(['role' => $fresh ? rbacRolePayload($db, $fresh, $orgId, null, false, $orgId > 0 && !rbacSystemRoleRow($db, $key)) : null],
            "Role updated successfully.");
    } catch (\Throwable $e) {
        if ($db->inTransaction()) $db->rollBack();
        sendError($e->getMessage() ?: "Could not update the role.", 422, [], 'ROLE_UPDATE_FAILED');
    }
}

/* ------------------------------------------------------------------ DELETE */
function handleRolesDelete($db, array $user): void {
    $adminId = requirePermission('roles.manage');
    $input = getJsonInput();
    $key = normalizeRoleKey((string)($input['key'] ?? ($_GET['key'] ?? '')));
    if ($key === '') sendError("A role 'key' is required.", 422, ['key' => 'Required'], 'VALIDATION_FAILED');

    $orgId = rbacTargetOrg($db, $user, isset($input['org_id']) ? (int)$input['org_id'] : null);
    if ($orgId <= 0) sendError("Platform roles cannot be deleted.", 403, [], 'ROLE_SYSTEM_READONLY');

    $row = rbacOrgRoleRow($db, $orgId, $key);
    if (!$row) sendError("Role '{$key}' was not found in this school.", 404, [], 'ROLE_NOT_FOUND');
    if ((int)($row['is_system'] ?? 0) === 1) {
        sendError("This role customises a built-in role and cannot be deleted.", 403, [], 'ROLE_SYSTEM_READONLY');
    }

    $assigned = rbacAssignedCount($db, $key, $orgId);
    $force = !empty($input['force']) || !empty($_GET['force']);
    if ($assigned > 0 && !$force) {
        sendError("{$assigned} user(s) still hold this role. Reassign them first, or pass force=1.", 409, [
            'assigned_users' => $assigned,
        ], 'ROLE_IN_USE');
    }

    try {
        $db->beginTransaction();

        $family = rbacFamilyOrgIds($db, $orgId);
        $in = implode(',', array_map('intval', $family ?: [$orgId]));

        // Reassign base-role holders to the default 'staff' role before removal.
        if ($assigned > 0) {
            $db->exec("UPDATE users SET role = 'staff' WHERE role = " . $db->quote($key) . " AND org_id IN ($in)");
        }
        $db->prepare("DELETE FROM user_roles WHERE role = :k")->execute([':k' => $key]);
        $db->prepare("DELETE FROM role_permissions WHERE org_id = :org AND role = :k")->execute([':org' => $orgId, ':k' => $key]);
        $db->prepare("DELETE FROM roles WHERE org_id = :org AND `key` = :k")->execute([':org' => $orgId, ':k' => $key]);

        $db->commit();

        \Alg\Audit\AuditLogger::log('rbac.role_deleted', 'role', (int)$row['id'], null, [
            'role' => $key, 'org_id' => $orgId, 'reassigned' => $assigned,
        ], $adminId, (int)($user['org_id'] ?? 0));

        sendSuccess(['key' => $key, 'reassigned_users' => $assigned], "Role '{$key}' deleted.");
    } catch (\Throwable $e) {
        if ($db->inTransaction()) $db->rollBack();
        sendError("Could not delete the role: " . $e->getMessage(), 500, [], 'ROLE_DELETE_FAILED');
    }
}
