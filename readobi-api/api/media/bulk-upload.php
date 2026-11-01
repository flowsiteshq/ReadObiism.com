<?php
/**
 * Media Module - Bulk Multi-File Upload Endpoint
 * POST /api/media/bulk-upload.php
 * 
 * Accepts multipart/form-data with 'files[]' array.
 * Supports:
 * - Simultaneous batch upload of multiple files
 * - Individual error handling (does not abort entire batch if 1 file fails)
 * - MIME checking and size limits per file
 * - Aggregate statistics (total_success, total_failed)
 */

require_once __DIR__ . '/../../config.php';

$currentUser = null;
try {
    $currentUser = verifyAuthToken();
} catch (Exception $e) {}

$userId = (int)($currentUser['id'] ?? 1);
$orgId = (int)($currentUser['org_id'] ?? 1);

if (!isset($_FILES['files'])) {
    sendError("No files provided. Send multipart/form-data with 'files[]'.", 400);
}

$folder = preg_replace('/[^a-zA-Z0-9_-]/', '', $_POST['folder'] ?? 'bulk');

$storage = new \Alg\Storage\StorageManager();

try {
    $result = $storage->uploadBulk($_FILES['files'], $userId, $orgId, $folder);

    \Alg\Audit\AuditLogger::log('media.bulk_upload', 'media_file', null, null, [
        'count' => $result['total_success'],
        'failed' => $result['total_failed']
    ], $userId, $orgId);

    sendSuccess($result, "Bulk upload batch processed.");
} catch (Exception $e) {
    sendError("Bulk upload failed: " . $e->getMessage(), 500);
}
