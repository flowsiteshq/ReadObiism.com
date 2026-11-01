<?php
/**
 * Auth Module - Current User Profile & Context Endpoint
 * GET  /api/auth/me.php -> Returns current user profile
 * POST /api/auth/me.php -> Updates current user profile details
 * PUT  /api/auth/me.php -> Updates current user profile details
 *
 * Every authenticated user can view and edit their own profile details
 * (name, email, phone, job title/designation, bio, timezone, language, avatar).
 */

require_once __DIR__ . '/../../config.php';

$currentUser = verifyAuthToken();
$db = requireDatabase(getDbConnection());

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

if ($method === 'POST' || $method === 'PUT') {
    $input = getJsonInput();

    // Name handling (accepts fullName / name, or first_name + last_name)
    $firstName = trim((string)($input['first_name'] ?? ''));
    $lastName  = trim((string)($input['last_name'] ?? ''));
    $name = trim((string)($input['name'] ?? $input['fullName'] ?? ''));
    if ($name === '' && ($firstName !== '' || $lastName !== '')) {
        $name = trim($firstName . ' ' . $lastName);
    }

    $email = trim((string)($input['email'] ?? ''));
    $phone = trim((string)($input['phone'] ?? ''));
    $designation = trim((string)($input['designation'] ?? $input['role'] ?? $input['job_title'] ?? ''));
    // Clean display suffix like " — School OS" if echoed from UI
    if (strpos($designation, '—') !== false) {
        $parts = explode('—', $designation);
        $designation = trim($parts[0]);
    }
    $bio = trim((string)($input['bio'] ?? ''));
    $timezone = trim((string)($input['timezone'] ?? ''));
    $language = trim((string)($input['language'] ?? $input['lang'] ?? ''));
    $avatarUrl = trim((string)($input['avatar_url'] ?? $input['avatarUrl'] ?? ''));

    // Validation
    if ($name === '') {
        sendError("Name is required.", 422, ['name' => 'Name cannot be empty.'], 'VALIDATION_FAILED');
    }
    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        sendError("A valid email address is required.", 422, ['email' => 'Invalid email address.'], 'VALIDATION_FAILED');
    }

    try {
        // If email changed, check uniqueness across other users
        if ($email !== '') {
            $checkStmt = $db->prepare("SELECT id FROM users WHERE email = :email AND id != :id AND deleted_at IS NULL LIMIT 1");
            $checkStmt->execute([':email' => $email, ':id' => (int)$currentUser['id']]);
            if ($checkStmt->fetch()) {
                sendError("This email address is already in use by another account.", 409, ['email' => 'Email is already in use.'], 'EMAIL_EXISTS');
            }
        }

        // Fetch current user row to preserve fields if not supplied
        $currStmt = $db->prepare("SELECT * FROM users WHERE id = :id LIMIT 1");
        $currStmt->execute([':id' => (int)$currentUser['id']]);
        $existing = $currStmt->fetch(PDO::FETCH_ASSOC);

        if (!$existing) {
            sendError("User record not found.", 404);
        }

        $finalEmail = $email !== '' ? $email : $existing['email'];
        $finalPhone = array_key_exists('phone', $input) ? ($phone ?: null) : ($existing['phone'] ?? null);
        $finalDesignation = ($designation !== '') ? $designation : ($existing['designation'] ?? null);
        $finalBio = array_key_exists('bio', $input) ? ($bio ?: null) : ($existing['bio'] ?? null);
        $finalTz = ($timezone !== '') ? $timezone : ($existing['timezone'] ?? 'UTC');
        $finalLang = ($language !== '') ? $language : ($existing['language'] ?? 'en');
        $finalAvatar = ($avatarUrl !== '') ? $avatarUrl : ($existing['avatar_url'] ?? null);

        $upStmt = $db->prepare("
            UPDATE users SET
                name = :name,
                email = :email,
                phone = :phone,
                designation = :designation,
                bio = :bio,
                timezone = :timezone,
                language = :language,
                avatar_url = :avatar_url,
                updated_at = NOW()
            WHERE id = :id
        ");
        $upStmt->execute([
            ':name'        => $name,
            ':email'       => $finalEmail,
            ':phone'       => $finalPhone,
            ':designation' => $finalDesignation,
            ':bio'         => $finalBio,
            ':timezone'    => $finalTz,
            ':language'    => $finalLang,
            ':avatar_url'  => $finalAvatar,
            ':id'          => (int)$currentUser['id'],
        ]);

        // Sync teacher_profiles if exists
        try {
            $tpStmt = $db->prepare("
                UPDATE teacher_profiles SET
                    bio = :bio,
                    updated_at = NOW()
                WHERE user_id = :uid
            ");
            $tpStmt->execute([
                ':bio' => $finalBio,
                ':uid' => (int)$currentUser['id'],
            ]);
        } catch (\PDOException $e) {}

        \Alg\Audit\AuditLogger::log(
            'auth.update_profile', 'user', (int)$currentUser['id'],
            null, ['name' => $name, 'email' => $finalEmail], (int)$currentUser['id'], (int)($existing['org_id'] ?? 1)
        );

    } catch (PDOException $e) {
        sendError("Failed to update profile: " . $e->getMessage(), 500);
    }
}

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

    $extraRoles = getUserExtraRoles($db, (int)$row['id']);
    $permissions = fetchUserPermissions(
        $db,
        $row['role'],
        (int)($row['org_id'] ?? 0),
        $extraRoles
    );
    $userData = buildAuthUserPayload($row, $permissions, $extraRoles);
    $userData['created_at'] = $row['created_at'] ?? null;
    $userData['organization'] = [
        'id'       => (int)$row['org_id'],
        'name'     => $row['org_name'] ?? 'School OS',
        'slug'     => $row['org_slug'] ?? 'school-os',
        'logo_url' => $row['org_logo'] ?? null,
        'plan_code'          => $row['org_plan_code'] ?? null,
        'onboarding_complete'=> (bool)($row['org_onboarding_complete'] ?? false),
    ];

    $msg = ($method === 'POST' || $method === 'PUT') ? "Profile updated successfully." : "User profile loaded successfully.";
    sendSuccess($userData, $msg);

} catch (PDOException $e) {
    sendError("Profile service error. Please try again.", 500);
}
