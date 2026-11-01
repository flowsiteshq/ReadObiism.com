<?php
/**
 * Media Module - Single File Upload Endpoint
 * POST /api/media/upload.php
 * 
 * Accepts multipart/form-data with 'file' field.
 * Supports:
 * - MIME verification (Images, PDF, Documents, ZIP, Audio, Video)
 * - File size limits (default: 10MB)
 * - Safe filename hashing
 * - Local storage saving & Database indexing
 * - Audit logging
 */

require_once __DIR__ . '/../../config.php';

// Authentication required for media uploads
$userId = requireAuth();
$currentUser = verifyAuthToken();
$orgId = (int)($currentUser['org_id'] ?? 1);

// Rate limiting: Max 30 uploads per 5 minutes
\Alg\Security\RateLimiter::check('media_upload', 30, 300);

if (!isset($_FILES['file'])) {
    sendError("No file payload detected. Provide multipart/form-data with field 'file'.", 400);
}

$folder = preg_replace('/[^a-zA-Z0-9_-]/', '', $_POST['folder'] ?? 'general');

$storage = new \Alg\Storage\StorageManager();

try {
    $fileData = $storage->upload($_FILES['file'], $userId, $orgId, $folder);

    \Alg\Audit\AuditLogger::log('media.upload', 'media_file', (int)$fileData['id'], null, ['name' => $fileData['original_name'], 'size' => $fileData['size']], $userId, $orgId);

    sendSuccess($fileData, "File uploaded successfully.", 201);
} catch (Exception $e) {
    sendError($e->getMessage(), 400);
}
