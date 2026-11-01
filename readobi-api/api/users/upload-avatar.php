<?php
/**
 * User Management - Profile / Passport Photo Upload Endpoint
 * POST /api/users/upload-avatar.php
 *
 * Supports:
 * - Bearer Token authentication
 * - Self upload (no user_id) OR administrator on-behalf-of upload (`user_id`),
 *   limited to users inside the caller's own campus family with an update-grade
 *   permission (users.update / staff.update / students.update / parents.update),
 *   or any user for platform administrators.
 * - Validates the real image MIME type (JPEG, PNG, WebP, GIF) with finfo.
 * - Centre-crops to a square and resizes (512×512) server-side when PHP GD is
 *   available; otherwise the file is stored as received (the client already
 *   centre-crops before uploading, see assets/js/alg/alg-avatar-picker.js).
 * - Stores in the 'avatars' folder and updates users.avatar_url.
 * - Audit logging.
 *
 * Response: { user_id, avatar_url, filename, size }
 */

require_once __DIR__ . '/../../config.php';

$caller     = verifyAuthToken();
$callerId   = (int)($caller['id'] ?? 0);
$callerOrg  = (int)($caller['org_id'] ?? 1);
$callerRole = (string)($caller['role'] ?? '');
$callerPerms = is_array($caller['permissions'] ?? null) ? $caller['permissions'] : [];

$db = getDbConnection();

/* ------------------------------------------------------------------ target */
$targetId = isset($_POST['user_id']) ? (int)$_POST['user_id'] : 0;
$isSelf   = ($targetId <= 0 || $targetId === $callerId);

if ($isSelf) {
    $targetId = $callerId;
    $orgId    = $callerOrg;
} else {
    requireDatabase($db);

    $stmt = $db->prepare("SELECT id, org_id, role, name FROM users WHERE id = :id AND deleted_at IS NULL LIMIT 1");
    $stmt->execute([':id' => $targetId]);
    $target = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$target) {
        sendError("User not found.", 404, [], 'USER_NOT_FOUND');
    }

    $isPlatform = isPlatformAdminRole($callerRole);
    $hasManagePerm = in_array('*', $callerPerms, true)
        || (bool)array_intersect($callerPerms, ['users.update', 'staff.update', 'students.update', 'parents.update'])
        || in_array($callerRole, ['school_admin', 'admin'], true);
    $inFamily = canAccessOrgFamily($db, $callerOrg, (int)$target['org_id']);

    if (!$isPlatform && !($hasManagePerm && $inFamily)) {
        sendError("Forbidden. You cannot manage this user's photo.", 403, [], 'FORBIDDEN_AVATAR_TARGET');
    }

    $orgId = (int)$target['org_id'];
}

/* -------------------------------------------------------------------- file */
if (!isset($_FILES['avatar']) && !isset($_FILES['file'])) {
    sendError("No avatar file provided. Send multipart/form-data with field 'avatar' or 'file'.", 400, [], 'AVATAR_MISSING');
}

$file = $_FILES['avatar'] ?? $_FILES['file'];

if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    sendError("The uploaded file could not be received (error code " . ($file['error'] ?? 'UNKNOWN') . ").", 422, [], 'AVATAR_UPLOAD_ERROR');
}

// Verify the real MIME type is an image.
$finfo = finfo_open(FILEINFO_MIME_TYPE);
$mime  = finfo_file($finfo, $file['tmp_name']);
finfo_close($finfo);

$allowedImageMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
if (!in_array($mime, $allowedImageMimes, true)) {
    sendError("Invalid file type. Profile picture must be a JPEG, PNG, WebP, or GIF image.", 422, [], 'AVATAR_INVALID_TYPE');
}

/**
 * Centre-crop to a square and resize in place — only when GD is available.
 * The upload is re-encoded as JPEG (opaque white background) so the stored
 * extension always matches the detected MIME on the subsequent finfo check.
 */
function algAvatarSquareCrop(array &$file, int $target = 512): void
{
    if (!function_exists('imagecreatetruecolor')) {
        return; // GD not enabled — client-side crop already handled it.
    }
    $info = @getimagesize($file['tmp_name']);
    if (!$info || empty($info['mime'])) {
        return;
    }
    switch ($info['mime']) {
        case 'image/jpeg': $src = @imagecreatefromjpeg($file['tmp_name']); break;
        case 'image/png':  $src = @imagecreatefrompng($file['tmp_name']); break;
        case 'image/webp': $src = function_exists('imagecreatefromwebp') ? @imagecreatefromwebp($file['tmp_name']) : null; break;
        case 'image/gif':  $src = @imagecreatefromgif($file['tmp_name']); break;
        default:           $src = null;
    }
    if (!$src) {
        return;
    }

    $w = imagesx($src);
    $h = imagesy($src);
    $side = min($w, $h);
    $sx = (int)max(0, ($w - $side) / 2);
    // Bias crop towards the top for portrait photos so head and hair are preserved
    $sy = (int)max(0, ($h > $side) ? round(($h - $side) * 0.12) : 0);

    $dst = imagecreatetruecolor($target, $target);
    $white = imagecolorallocate($dst, 255, 255, 255);
    imagefilledrectangle($dst, 0, 0, $target, $target, $white);
    imagecopyresampled($dst, $src, 0, 0, $sx, $sy, $target, $target, $side, $side);

    $ok = @imagejpeg($dst, $file['tmp_name'], 90);
    imagedestroy($src);
    imagedestroy($dst);

    if ($ok) {
        $file['name'] = preg_replace('/\.[a-z0-9]+$/i', '', (string)$file['name']) . '.jpg';
        $file['size'] = (int)@filesize($file['tmp_name']);
    }
}

algAvatarSquareCrop($file, 512);

/* ------------------------------------------------------------------ store */
$storage = new \Alg\Storage\StorageManager();

// Capture the current avatar first so the file it points at can be reclaimed
// once the replacement is stored (keeps one file per user, forever).
$previousUrl = '';
if ($db) {
    $prevStmt = $db->prepare("SELECT avatar_url FROM users WHERE id = :id LIMIT 1");
    $prevStmt->execute([':id' => $targetId]);
    $previousUrl = (string)($prevStmt->fetchColumn() ?: '');
}

try {
    // Slot ties the object to the user: re-uploading overwrites avatars/user-<id>.<ext>
    // instead of piling up a new file on every change.
    $uploaded  = $storage->upload($file, $targetId, $orgId, 'avatars', [
        'slot'                 => 'user-' . $targetId,
        'delete_previous_url'  => $previousUrl,
    ]);
    $avatarUrl = $uploaded['url'];

    if ($db) {
        $stmt = $db->prepare("UPDATE users SET avatar_url = :url, updated_at = NOW() WHERE id = :id");
        $stmt->execute([':url' => $avatarUrl, ':id' => $targetId]);

        \Alg\Audit\AuditLogger::log(
            'user.avatar_updated',
            'user',
            $targetId,
            $previousUrl !== '' ? ['avatar_url' => $previousUrl] : null,
            ['avatar_url' => $avatarUrl],
            $callerId,
            $orgId
        );
    }

    sendSuccess([
        'user_id'    => $targetId,
        'avatar_url' => $avatarUrl,
        'filename'   => $uploaded['filename'],
        'size'       => $uploaded['size'],
    ], "Profile picture updated successfully.");
} catch (Exception $e) {
    sendError("Avatar upload failed: " . $e->getMessage(), 500, [], 'AVATAR_UPLOAD_FAILED');
}
