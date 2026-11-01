<?php
/**
 * Media Module - Single and Multiple Image Upload Endpoint
 * POST /api/media/upload-images.php
 * 
 * Supports:
 * - Single image upload via 'image' or 'file'
 * - Multiple image upload via 'images[]'
 * - Strict image MIME validation (JPEG, PNG, WebP, GIF, SVG)
 * - Returns structured URLs, filenames, and dimensions metadata
 */

require_once __DIR__ . '/../../config.php';

// Authentication required for image uploads
$userId = requireAuth();
$currentUser = verifyAuthToken();
$orgId = (int)($currentUser['org_id'] ?? 1);

// Rate limiting: Max 30 upload requests per 5 minutes
\Alg\Security\RateLimiter::check('image_upload', 30, 300);

$storage = new \Alg\Storage\StorageManager();
$folder = preg_replace('/[^a-zA-Z0-9_-]/', '', $_POST['folder'] ?? 'images');

// 1. Multiple Images Upload ('images[]')
if (isset($_FILES['images']) && is_array($_FILES['images']['name'])) {
    $results = [];
    $errors = [];
    $count = count($_FILES['images']['name']);

    for ($i = 0; $i < $count; $i++) {
        if ($_FILES['images']['error'][$i] === UPLOAD_ERR_NO_FILE) continue;

        $single = [
            'name'     => $_FILES['images']['name'][$i],
            'type'     => $_FILES['images']['type'][$i],
            'tmp_name' => $_FILES['images']['tmp_name'][$i],
            'error'    => $_FILES['images']['error'][$i],
            'size'     => $_FILES['images']['size'][$i],
        ];

        // Check image MIME
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mime = finfo_file($finfo, $single['tmp_name']);
        finfo_close($finfo);

        if (strpos($mime, 'image/') !== 0) {
            $errors[] = [
                'file' => $single['name'],
                'error' => "Only image formats are supported."
            ];
            continue;
        }

        try {
            $uploaded = $storage->upload($single, $userId, $orgId, $folder);
            $results[] = $uploaded;
        } catch (Exception $e) {
            $errors[] = [
                'file' => $single['name'],
                'error' => $e->getMessage()
            ];
        }
    }

    sendSuccess([
        'images'        => $results,
        'errors'        => $errors,
        'total_success' => count($results),
        'total_failed'  => count($errors)
    ], "Image batch processing completed.");
}

// 2. Single Image Upload ('image' or 'file')
$file = $_FILES['image'] ?? $_FILES['file'] ?? null;
if (!$file) {
    sendError("No image supplied. Upload single image as 'image' or multiple as 'images[]'.", 400);
}

$finfo = finfo_open(FILEINFO_MIME_TYPE);
$mime = finfo_file($finfo, $file['tmp_name']);
finfo_close($finfo);

if (strpos($mime, 'image/') !== 0) {
    sendError("Uploaded file is not a valid image format ({$mime}).", 422);
}

try {
    $uploaded = $storage->upload($file, $userId, $orgId, $folder);
    sendSuccess($uploaded, "Image uploaded successfully.", 201);
} catch (Exception $e) {
    sendError("Image upload failed: " . $e->getMessage(), 500);
}
