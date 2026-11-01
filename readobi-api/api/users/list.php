<?php
/**
 * User Management - List Users Endpoint
 * GET /api/users/list.php
 * 
 * Supports:
 * - Bearer Token authentication required
 * - Pagination (?page=1&limit=20)
 * - Filtering by role, status, or search query
 * - Organization multi-tenant isolation
 */

require_once __DIR__ . '/../../config.php';

requirePermission('users.view');
$currentUser = verifyAuthToken();
$db = getDbConnection();
// Tenant scoping: a platform admin switched into a school sees only that school's
// users; everyone else is pinned to their own org (see resolveEffectiveOrgId()).
$orgId = resolveEffectiveOrgId($currentUser, $db);

$page = max(1, (int)($_GET['page'] ?? 1));
$limit = min(100, max(1, (int)($_GET['limit'] ?? 20)));
$offset = ($page - 1) * $limit;
$search = trim($_GET['search'] ?? '');
$roleFilter = trim($_GET['role'] ?? '');

$users = [];
$total = 0;

if ($db) {
    try {
        $where = ["org_id = :org_id", "deleted_at IS NULL"];
        $params = [':org_id' => $orgId];

        if (!empty($search)) {
            $where[] = "(name LIKE :search OR email LIKE :search)";
            $params[':search'] = "%{$search}%";
        }

        if (!empty($roleFilter)) {
            $where[] = "role = :role";
            $params[':role'] = $roleFilter;
        }

        $whereClause = implode(' AND ', $where);

        $countStmt = $db->prepare("SELECT COUNT(*) FROM users WHERE {$whereClause}");
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        $dataStmt = $db->prepare("
            SELECT id, org_id, name, email, phone, avatar_url, role, status, email_verified_at, created_at
            FROM users
            WHERE {$whereClause}
            ORDER BY id DESC
            LIMIT :limit OFFSET :offset
        ");
        foreach ($params as $k => $v) {
            $dataStmt->bindValue($k, $v);
        }
        $dataStmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $dataStmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $dataStmt->execute();
        $users = $dataStmt->fetchAll();

    } catch (PDOException $e) {}
}

if (empty($users) && $total === 0) {
    $users = [];
}

sendSuccess($users, "Users retrieved.", 200, [
    'current_page' => $page,
    'per_page'     => $limit,
    'total'        => $total,
    'total_pages'  => ceil($total / $limit)
]);
