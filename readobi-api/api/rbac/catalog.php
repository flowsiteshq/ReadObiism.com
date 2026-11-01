<?php
/**
 * RBAC Module — Permission Catalog
 * GET /api/rbac/catalog.php
 *
 * Returns the full permission catalog, both flat (for lookup tables) and grouped
 * by module (for the permission-matrix UI). Read-only.
 */

require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/_rbac.php';

$db = requireDatabase(getDbConnection());
$user = verifyAuthToken();
requirePermission('roles.view');

$catalog = rbacPermissionCatalog($db);

sendSuccess([
    'permissions_catalog' => $catalog,
    'permission_modules'  => rbacPermissionModules($catalog),
    'target_org_id'       => rbacManageOrg($db, $user),
    'can_manage'          => ($user['role'] ?? '') === 'super_admin'
                              || in_array('roles.manage', $user['permissions'] ?? [], true),
], "Permission catalog retrieved.");
