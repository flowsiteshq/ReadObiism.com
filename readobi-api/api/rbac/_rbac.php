<?php
/**
 * RBAC Module — Shared helpers for /api/rbac/* endpoints.
 *
 * Centralises the tenant-scoping and role/permission plumbing so roles.php,
 * permissions.php, catalog.php and assign.php stay thin and consistent.
 */

if (!defined('ALG_RBAC_LOADED')) {
    define('ALG_RBAC_LOADED', true);
}

/** All org ids in a campus family (root + direct branches). */
function rbacFamilyOrgIds($db, int $root): array {
    if (!$db || $root <= 0) return [];
    try {
        $stmt = $db->prepare("SELECT id FROM organizations WHERE deleted_at IS NULL AND (id = :root OR parent_org_id = :root)");
        $stmt->execute([':root' => $root]);
        $ids = array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN) ?: []);
        if (!in_array($root, $ids, true)) $ids[] = $root;
        return $ids;
    } catch (\Throwable $e) {
        return [$root];
    }
}

/** SQL fragment restricting `$alias`.org_id to the given allowed org ids. */
function rbacOrgFilter(array $ids, string $alias = 'u'): string {
    if (empty($ids)) return '';
    return " AND {$alias}.org_id IN (" . implode(',', array_map('intval', $ids)) . ")";
}

/**
 * The org a caller manages roles for.
 *   - Platform admins: ?org_id / impersonation / active header, else 0 (system).
 *   - School users: their own campus family root (so an override applies family-wide).
 * The returned value is the family root; 0 means the global/system scope.
 */
function rbacManageOrg($db, array $user): int {
    if (isPlatformAdminRole($user['role'] ?? '')) {
        $requested = (int)($_GET['org_id'] ?? 0);
        if ($requested <= 0) $requested = getImpersonationOrgHeader() ?: getActiveOrgHeader();
        if ($requested > 0 && organizationExists($db, $requested)) {
            return resolveOrgFamilyRoot($db, $requested);
        }
        return 0;
    }
    return resolveManagingRoot($db, $user);
}

/** One role catalog row, preferring an org-scoped entry over the system entry. */
function rbacRoleRow($db, int $orgId, string $key): ?array {
    foreach (array_values(array_unique([$orgId, 0])) as $scope) {
        $stmt = $db->prepare("SELECT * FROM roles WHERE org_id = :org AND `key` = :k AND deleted_at IS NULL LIMIT 1");
        $stmt->execute([':org' => $scope, ':k' => $key]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row) return $row;
    }
    return null;
}

/** The system (org 0) catalog row for a key, if any. */
function rbacSystemRoleRow($db, string $key): ?array {
    $stmt = $db->prepare("SELECT * FROM roles WHERE org_id = 0 AND `key` = :k AND deleted_at IS NULL LIMIT 1");
    $stmt->execute([':k' => $key]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

/** The org-scoped catalog row (custom role or override), if any. */
function rbacOrgRoleRow($db, int $orgId, string $key): ?array {
    if ($orgId <= 0) return null;
    $stmt = $db->prepare("SELECT * FROM roles WHERE org_id = :org AND `key` = :k AND deleted_at IS NULL LIMIT 1");
    $stmt->execute([':org' => $orgId, ':k' => $key]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

/** Total number of distinct users holding $roleKey within an org scope. */
function rbacAssignedCount($db, string $roleKey, int $orgId): int {
    $ids = $orgId > 0 ? rbacFamilyOrgIds($db, $orgId) : [];
    $f1 = rbacOrgFilter($ids, 'u');
    $f2 = rbacOrgFilter($ids, 'u');
    $stmt = $db->prepare("
        SELECT COUNT(*) FROM (
            SELECT u.id FROM users u
             WHERE u.deleted_at IS NULL AND u.role = ? {$f1}
            UNION
            SELECT ur.user_id AS id FROM user_roles ur
              JOIN users u ON u.id = ur.user_id
             WHERE ur.role = ? AND u.deleted_at IS NULL {$f2}
        ) t
    ");
    $stmt->execute([$roleKey, $roleKey]);
    return (int)$stmt->fetchColumn();
}

/** Normalise a catalog row + optional org override into an API payload. */
function rbacRolePayload($db, array $base, int $orgId, ?array $override, bool $customized, bool $isCustom): array {
    $key = (string)$base['key'];
    $meta = $isCustom ? $base : ($customized && $override ? array_merge($base, $override) : $base);
    $matrixOrg = ($isCustom || $customized) ? $orgId : 0;
    $perms = rolePermissionKeys($db, $key, $matrixOrg);
    $isPlatformRole = (($base['scope'] ?? 'organization') === 'platform');

    return [
        'key'               => $key,
        'label'             => (string)($meta['label'] ?? $key),
        'description'       => $meta['description'] ?? null,
        'scope'             => $base['scope'] ?? 'organization',
        'is_system'         => (int)($base['is_system'] ?? 0),
        'is_assignable'     => (int)($base['is_assignable'] ?? 1),
        'is_default'        => (int)($base['is_default'] ?? 0),
        'wildcard'          => (int)($base['wildcard'] ?? 0),
        'sort_order'        => (int)($base['sort_order'] ?? 100),
        'org_id'            => $isCustom ? $orgId : 0,
        'is_custom'         => $isCustom,
        'customized'        => $customized,
        // Metadata (rename/delete) is only editable for custom roles; the
        // permission matrix is editable for any non-platform role.
        'can_edit_meta'     => $isCustom,
        'can_edit_perms'    => !$isPlatformRole,
        'permissions'       => $perms,
        'permissions_count' => count($perms),
        'assigned_users'    => rbacAssignedCount($db, $key, $orgId),
    ];
}

/** Every role visible in an org scope: system roles + org roles, de-duplicated.
 *  Platform-scope roles (super_admin, product_admin, ...) belong to the global
 *  ALG/platform scope only — a school (org > 0) must never see or manage them. */
function rbacListRoles($db, int $orgId): array {
    $out = [];

    $stmt = $db->query("SELECT * FROM roles WHERE org_id = 0 AND deleted_at IS NULL ORDER BY sort_order, label");
    $system = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    foreach ($system as $r) {
        if ($orgId > 0 && (($r['scope'] ?? 'organization') === 'platform')) continue;
        $override = $orgId > 0 ? rbacOrgRoleRow($db, $orgId, $r['key']) : null;
        $out[] = rbacRolePayload($db, $r, $orgId, $override, (bool)$override, false);
    }

    if ($orgId > 0) {
        $stmt = $db->prepare("SELECT * FROM roles WHERE org_id = :org AND deleted_at IS NULL ORDER BY sort_order, label");
        $stmt->execute([':org' => $orgId]);
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
            if (rbacSystemRoleRow($db, $r['key'])) continue; // already listed as override
            $out[] = rbacRolePayload($db, $r, $orgId, null, false, true);
        }
    }

    usort($out, function ($a, $b) {
        return ($a['sort_order'] - $b['sort_order']) ?: strcasecmp((string)$a['label'], (string)$b['label']);
    });
    return $out;
}

/** The permission catalog as flat rows. */
function rbacPermissionCatalog($db): array {
    $stmt = $db->query("SELECT id, `key`, description FROM permissions ORDER BY `key`");
    return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
}

/** Human label for a permission module prefix. */
function rbacModuleLabel(string $module): string {
    $labels = [
        'schools'    => 'Schools & Campuses',
        'users'      => 'User Accounts',
        'students'   => 'Students',
        'teachers'   => 'Teachers',
        'staff'      => 'Staff',
        'parents'    => 'Parents & Guardians',
        'classes'    => 'Classes',
        'attendance' => 'Attendance',
        'exams'      => 'Exams & Results',
        'fees'       => 'Fees & Billing',
        'invoices'   => 'Invoices & Billing',
        'payments'   => 'Payments & Receipts',
        'ledger'     => 'General Ledger',
        'expenses'   => 'Operating Expenses',
        'reports'    => 'Reports & Analytics',
        'settings'   => 'System Settings',
        'media'      => 'Media Library',
        'leads'      => 'Leads',
        'ai'         => 'AI Tools',
        'profile'    => 'My Profile',
        'roles'      => 'Roles & Permissions',
        'audit'      => 'Audit & Compliance',
        'operations' => 'School Operations',
        'announcements' => 'Announcements',
        'forms'      => 'Digital Forms',
        'hr'         => 'Human Resources',
    ];
    return $labels[$module] ?? ucfirst(str_replace('_', ' ', $module));
}

/** Group the flat catalog into modules for the permission-matrix UI. */
function rbacPermissionModules(array $rows): array {
    $mods = [];
    foreach ($rows as $r) {
        $key = (string)$r['key'];
        $module = explode('.', $key, 2)[0];
        if (!isset($mods[$module])) {
            $mods[$module] = ['module' => $module, 'label' => rbacModuleLabel($module), 'permissions' => []];
        }
        $mods[$module]['permissions'][] = ['key' => $key, 'description' => $r['description'] ?? null];
    }
    return array_values($mods);
}

/**
 * Anti-escalation guard: can $user assign/revoke the role $roleKey?
 * Only super_admin may hand out super_admin; school users may not assign
 * platform-scope roles.
 */
function rbacCanAssign($db, array $user, string $roleKey): bool {
    $roleKey = normalizeRoleKey($roleKey);
    if ($roleKey === '' || $roleKey === 'user') return false;
    if ($roleKey === 'super_admin') {
        return ($user['role'] ?? '') === 'super_admin';
    }
    if (isPlatformAdminRole($user['role'] ?? '')) return true;
    $sys = rbacSystemRoleRow($db, $roleKey);
    if ($sys && ($sys['scope'] ?? 'organization') === 'platform') return false;
    // The role must exist (as a system role or in the caller's own family).
    if (!$sys) {
        $orgId = resolveManagingRoot($db, $user);
        if (!rbacOrgRoleRow($db, $orgId, $roleKey)) return false;
    }
    return true;
}

/** The set of valid permission keys (as an assoc map for O(1) lookup). */
function rbacValidKeys($db): array {
    $set = [];
    foreach (rbacPermissionCatalog($db) as $r) $set[(string)$r['key']] = true;
    return $set;
}

/** Replace the full permission set for a role/org (validated against the catalog). */
function rbacReplaceRolePermissions($db, int $orgId, string $roleKey, array $keys): void {
    $valid = rbacValidKeys($db);
    $clean = [];
    foreach ($keys as $k) {
        $k = trim((string)$k);
        if ($k !== '' && isset($valid[$k])) $clean[$k] = true;
    }
    $clean = array_keys($clean);

    $db->prepare("DELETE FROM role_permissions WHERE org_id = :org AND role = :role")
       ->execute([':org' => $orgId, ':role' => $roleKey]);

    if (empty($clean)) return;
    $placeholders = implode(',', array_fill(0, count($clean), '?'));
    $ins = $db->prepare("
        INSERT IGNORE INTO role_permissions (org_id, role, permission_id)
        SELECT ?, ?, id FROM permissions WHERE `key` IN ($placeholders)
    ");
    $ins->execute(array_merge([$orgId, $roleKey], $clean));
}

/** JSON output for the RBAC endpoints (success/error helpers live in config). */
function rbacSendRoles($db, array $user, int $orgId, string $message): void {
    $catalog = rbacPermissionCatalog($db);
    sendSuccess([
        'roles'               => rbacListRoles($db, $orgId),
        'permissions_catalog' => $catalog,
        'permission_modules'  => rbacPermissionModules($catalog),
        'target_org_id'       => $orgId,
        'is_platform'         => isPlatformAdminRole($user['role'] ?? ''),
        'can_manage'          => ($user['role'] ?? '') === 'super_admin'
                                  || in_array('roles.manage', $user['permissions'] ?? [], true),
    ], $message);
}
