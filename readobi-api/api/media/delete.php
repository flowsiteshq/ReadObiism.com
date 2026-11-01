<?php
/**
 * Media Module - Delete File Endpoint
 * POST /api/media/delete.php
 * 
 * Supports:
 * - Unlinking physical file from disk
 * - Soft-deleting record in database
 * - Multi-tenant isolation verification
 * - Audit logging
 */

require_once __DIR__ . '/../../config.php';

// Authentication required to delete media files
$userId = requireAuth();
$currentUser = verifyAuthToken();
$orgId = (int)($currentUser['org_id'] ?? 1);

$input = getJsonInput();
$fileId = (int)($input['id'] ?? $_POST['id'] ?? 0);

if ($fileId <= 0) {
    sendError("Valid media file ID is required.", 400);
}

$storage = new \Alg\Storage\StorageManager();
$success = $storage->delete($fileId, $orgId);

if ($success) {
    \Alg\Audit\AuditLogger::log('media.delete', 'media_file', $fileId, null, null, $userId, $orgId);
    sendSuccess(['id' => $fileId], "File deleted successfully.");
} else {
    sendError("Failed to delete file or file not found.", 404);
}
