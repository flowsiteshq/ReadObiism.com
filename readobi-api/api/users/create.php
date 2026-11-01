<?php
/**
 * User Management - Create User by Admin Endpoint
 * POST /api/users/create.php
 * 
 * Supports:
 * - Admin authorization check
 * - Bcrypt password hashing
 * - Role assignment
 * - Welcome email dispatch
 * - Audit logging
 */

require_once __DIR__ . '/../../config.php';

requirePermission('users.create');
$currentUser = verifyAuthToken();
if (!in_array($currentUser['role'] ?? '', ['super_admin', 'admin'])) {
    sendError("Only administrators can create user accounts directly.", 403);
}

$auth = new \Alg\Security\AuthManager();
$mailer = new \Alg\Mail\Mailer();
$db = getDbConnection();
$input = getJsonInput();

$name = trim($input['name'] ?? '');
$email = trim($input['email'] ?? '');
$password = trim($input['password'] ?? '');
$phone = trim($input['phone'] ?? '');
$role = strtolower(trim($input['role'] ?? 'user'));
$orgId = resolveEffectiveOrgId($currentUser, $db);

$validRoles = ['super_admin', 'product_admin', 'admin', 'manager', 'staff', 'user'];
if (!in_array($role, $validRoles)) {
    $role = 'user';
}

// Anti-Privilege Escalation
if ($role === 'super_admin' && ($currentUser['role'] ?? '') !== 'super_admin') {
    sendError("Privilege escalation violation: Only Super Admins can create Super Admin accounts.", 403);
}

if (empty($name) || empty($email)) {
    sendError("Name and email are required.", 400);
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    sendError("Invalid email address.", 422);
}

// Generate random password if not supplied
$plainPassword = !empty($password) ? $password : bin2hex(random_bytes(6));
$passwordHash = $auth->hashPassword($plainPassword);

$newId = time();

if ($db) {
    try {
        $check = $db->prepare("SELECT id FROM users WHERE email = :email LIMIT 1");
        $check->execute([':email' => $email]);
        if ($check->fetch()) {
            sendError("An account with this email address already exists.", 409);
        }

        $stmt = $db->prepare("
            INSERT INTO users (org_id, name, email, phone, password_hash, role, status, created_at)
            VALUES (:org_id, :name, :email, :phone, :hash, :role, 'active', NOW())
        ");
        $stmt->execute([
            ':org_id' => $orgId,
            ':name'   => $name,
            ':email'  => $email,
            ':phone'  => $phone ?: null,
            ':hash'   => $passwordHash,
            ':role'   => $role
        ]);
        $newId = (int)$db->lastInsertId();

    } catch (PDOException $e) {
        sendError("Database error while creating user.", 500);
    }
}

// Dispatch Welcome email with access credentials
$loginUrl = Config::get('app_url', 'http://localhost') . '/alg-company-frontend-boilerplate/dashboard/login.html';
$mailer->sendTemplate($email, "Your " . Config::get('app_name', 'ALG Studio') . " Account Details", 'welcome', [
    'name'      => $name,
    'app_name'  => Config::get('app_name', 'ALG Studio'),
    'login_url' => $loginUrl
]);

\Alg\Audit\AuditLogger::log('user.create', 'user', $newId, null, ['name' => $name, 'email' => $email, 'role' => $role], (int)$currentUser['id'], $orgId);

sendSuccess([
    'id'       => $newId,
    'name'     => $name,
    'email'    => $email,
    'role'     => $role,
    'status'   => 'active',
    'temporary_password' => empty($password) ? $plainPassword : null
], "User created successfully.", 201);
