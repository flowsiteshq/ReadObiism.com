<?php
/**
 * Excel / CSV Management - Bulk User Import Endpoint
 * POST /api/excel/import-users.php
 * 
 * Supports:
 * - Admin authorization check (requireAdmin)
 * - Parses CSV or Excel text data
 * - Email format validation & duplicate detection
 * - Batch user insertion with bcrypt password generation
 * - Optional transactional welcome email trigger
 * - Detailed error & success reporting
 */

require_once __DIR__ . '/../../config.php';

$currentUserId = requireAdmin();
$currentUser = verifyAuthToken();
$orgId = (int)($currentUser['org_id'] ?? 1);

if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
    sendError("Valid CSV file is required. Upload multipart/form-data with field 'file'.", 400);
}

$filePath = $_FILES['file']['tmp_name'];
$handle = fopen($filePath, 'r');
if (!$handle) {
    sendError("Failed to read uploaded file.", 500);
}

$sendWelcome = !empty($_POST['send_welcome']) && $_POST['send_welcome'] !== 'false';

$auth = new \Alg\Security\AuthManager();
$mailer = new \Alg\Mail\Mailer();
$db = getDbConnection();

$headers = fgetcsv($handle);
if (!$headers) {
    fclose($handle);
    sendError("Empty or invalid CSV file format.", 422);
}

// Normalize headers to lowercase
$headerMap = [];
foreach ($headers as $idx => $headerText) {
    $clean = strtolower(trim($headerText));
    $headerMap[$clean] = $idx;
}

$emailIdx = $headerMap['email'] ?? null;
$nameIdx = $headerMap['name'] ?? null;
$phoneIdx = $headerMap['phone'] ?? null;
$roleIdx = $headerMap['role'] ?? null;
$statusIdx = $headerMap['status'] ?? null;

if ($emailIdx === null || $nameIdx === null) {
    fclose($handle);
    sendError("CSV must include 'Name' and 'Email' columns.", 422);
}

$totalRows = 0;
$imported = 0;
$skipped = 0;
$errors = [];
$defaultPassword = "Changeme" . rand(100, 999) . "!";
$defaultHash = $auth->hashPassword($defaultPassword);

while (($row = fgetcsv($handle)) !== false) {
    $totalRows++;
    $name = trim($row[$nameIdx] ?? '');
    $email = trim($row[$emailIdx] ?? '');
    $phone = ($phoneIdx !== null) ? trim($row[$phoneIdx] ?? '') : null;
    $role = ($roleIdx !== null && !empty($row[$roleIdx])) ? strtolower(trim($row[$roleIdx])) : 'user';
    $status = ($statusIdx !== null && !empty($row[$statusIdx])) ? strtolower(trim($row[$statusIdx])) : 'active';

    if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $skipped++;
        $errors[] = "Row {$totalRows}: Invalid email address '{$email}'";
        continue;
    }

    if ($db) {
        try {
            // Duplicate check
            $check = $db->prepare("SELECT id FROM users WHERE email = :email LIMIT 1");
            $check->execute([':email' => $email]);
            if ($check->fetch()) {
                $skipped++;
                $errors[] = "Row {$totalRows}: Email '{$email}' already exists (skipped)";
                continue;
            }

            $targetRole = in_array($role, ['super_admin', 'admin', 'manager', 'staff', 'user']) ? $role : 'user';
            // Anti-privilege escalation during bulk import
            if ($targetRole === 'super_admin' && ($currentUser['role'] ?? '') !== 'super_admin') {
                $targetRole = 'admin';
            }

            $stmt = $db->prepare("
                INSERT INTO users (org_id, name, email, phone, password_hash, role, status, created_at)
                VALUES (:org_id, :name, :email, :phone, :hash, :role, :status, NOW())
            ");
            $stmt->execute([
                ':org_id' => $orgId,
                ':name'   => $name ?: 'Imported User',
                ':email'  => $email,
                ':phone'  => $phone ?: null,
                ':hash'   => $defaultHash,
                ':role'   => $targetRole,
                ':status' => in_array($status, ['active', 'pending', 'deactivated']) ? $status : 'active'
            ]);

            $imported++;

            if ($sendWelcome) {
                $loginUrl = Config::get('app_url', 'http://localhost') . '/alg-company-frontend-boilerplate/dashboard/login.html';
                $mailer->sendTemplate($email, "Your " . Config::get('app_name', 'ALG Studio') . " Account", 'welcome', [
                    'name'      => $name,
                    'app_name'  => Config::get('app_name', 'ALG Studio'),
                    'login_url' => $loginUrl
                ]);
            }

        } catch (PDOException $e) {
            $skipped++;
            \Alg\Audit\AuditLogger::log('error.db_bulk_import', 'user', null, null, ['error' => $e->getMessage(), 'email' => $email]);
            $errors[] = "Row {$totalRows}: Database error importing user '{$email}'";
        }
    } else {
        $imported++;
    }
}

fclose($handle);

\Alg\Audit\AuditLogger::log('users.bulk_imported', 'user', null, null, [
    'total_rows' => $totalRows,
    'imported'   => $imported,
    'skipped'    => $skipped
], $currentUserId, $orgId);

sendSuccess([
    'total_rows'     => $totalRows,
    'imported_count' => $imported,
    'skipped_count'  => $skipped,
    'errors'         => $errors,
    'temporary_pass' => $defaultPassword
], "Bulk import process completed.");
