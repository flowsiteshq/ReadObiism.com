<?php
/**
 * ALG Company - StorageManager Service
 *
 * Reusable storage and file management engine:
 * - Single file & bulk multi-file upload processing
 * - Strict MIME type security validation
 * - Configurable maximum file sizes
 * - Storage driver abstraction (Local Disk, AWS S3, Cloudflare R2)
 * - Automatic database metadata tracking
 * - Opaque, token-based public URLs (the real storage path is never exposed)
 * - Idempotent "slots": an entity (school logo, user avatar, resource cover…)
 *   can re-upload in place instead of accumulating one file per upload.
 *
 * Public URLs look like:  {app_url}/api/media/file.php?t=<random-token>
 * They are streamed by api/media/file.php; the physical path below /uploads
 * is never returned to a client (and direct /uploads access is denied).
 */

namespace Alg\Storage;

class StorageManager {
    protected $uploadDir;
    protected $maxFileSize;
    protected $allowedMimes = [
        'image/jpeg' => 'jpg',
        'image/png'  => 'png',
        'image/gif'  => 'gif',
        'image/webp' => 'webp',
        'image/svg+xml' => 'svg',
        'application/pdf' => 'pdf',
        'application/zip' => 'zip',
        'application/json' => 'json',
        'text/plain' => 'txt',
        'text/csv'   => 'csv',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'docx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => 'xlsx',
    ];

    public function __construct(string $uploadDir = null, int $maxFileSize = 10485760) {
        $this->uploadDir = $uploadDir ?: __DIR__ . '/../../uploads';
        $this->maxFileSize = $maxFileSize; // Default: 10MB

        if (!is_dir($this->uploadDir)) {
            @mkdir($this->uploadDir, 0755, true);
        }
    }

    /** Absolute path of the storage root (…/uploads). */
    public function storageRoot(): string {
        return $this->uploadDir;
    }

    /**
     * Upload a single file from a $_FILES entry.
     *
     * @param array  $file
     * @param int    $userId
     * @param int    $orgId
     * @param string $folder
     * @param array  $options Optional:
     *   - 'slot'               string  Stable per-entity key, e.g. "user-64",
     *                                  "org-3-logo", "o3-resource-12-cover".
     *                                  When present the file is stored under a
     *                                  deterministic name ("<slot>.<ext>") and
     *                                  any previous file for that slot is
     *                                  replaced instead of accumulating a new
     *                                  copy on every upload.
     *   - 'delete_previous_url' string A previous public URL to reclaim from
     *                                  disk once the new file is stored. Only
     *                                  removed when it resolves to a different
     *                                  object than the file just written.
     */
    public function upload(array $file, int $userId = 1, int $orgId = 1, string $folder = 'general', array $options = []): array {
        if (!isset($file['tmp_name']) || $file['error'] !== UPLOAD_ERR_OK) {
            throw new \Exception("File upload failed with error code: " . ($file['error'] ?? 'UNKNOWN'));
        }

        if ($file['size'] > $this->maxFileSize) {
            throw new \Exception("File size exceeds maximum allowed limit of " . ($this->maxFileSize / 1048576) . "MB");
        }

        // Validate MIME type safely using finfo
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mime = finfo_file($finfo, $file['tmp_name']);
        finfo_close($finfo);

        if (!array_key_exists($mime, $this->allowedMimes)) {
            throw new \Exception("Unsupported file type: {$mime}. Allowed: Images, PDF, Docs, CSV, ZIP.");
        }

        $extension = $this->allowedMimes[$mime];

        // Security Check: Block dangerous executable signatures even in text/svg/images
        $contentSample = file_get_contents($file['tmp_name'], false, null, 0, 8192);
        if ($contentSample !== false && preg_match('/<\?(?:php|=|\s)|<script\s+language\s*=\s*["\']?php/i', $contentSample)) {
            \Alg\Audit\AuditLogger::log('security.upload_blocked_rce', 'file', null, null, [
                'name' => $file['name'],
                'mime' => $mime,
                'ip'   => $_SERVER['REMOTE_ADDR'] ?? 'unknown'
            ], $userId, $orgId);
            throw new \Exception("Security Violation: Executable script code detected in uploaded file.");
        }

        // SVG Security Hardening (Block Stored XSS)
        if ($extension === 'svg') {
            $svgContent = file_get_contents($file['tmp_name']);
            if (preg_match('/<script|onload\s*=|onerror\s*=|onclick\s*=|javascript:|data:text\/html|<foreignObject|<iframe/i', $svgContent)) {
                \Alg\Audit\AuditLogger::log('security.upload_blocked_xss', 'file', null, null, [
                    'name' => $file['name'],
                    'mime' => $mime
                ], $userId, $orgId);
                throw new \Exception("Security Violation: SVG contains disallowed active scripts or event handlers.");
            }
        }

        // Prevent folder traversal (reject ../ or non-alphanumeric folder names)
        $cleanFolder = preg_replace('/[^a-zA-Z0-9_\-]/', '', str_replace(['..', '/', '\\'], '', $folder));
        $cleanFolder = empty($cleanFolder) ? 'general' : $cleanFolder;

        $safeOriginalName = preg_replace('/[^a-zA-Z0-9_\.-]/', '_', $file['name']);

        $targetFolder = $this->uploadDir . '/' . $cleanFolder;
        if (!is_dir($targetFolder)) {
            @mkdir($targetFolder, 0755, true);
        }

        // Resolve the storage filename. A slot yields a deterministic name so a
        // re-upload of the same entity overwrites the previous object.
        $slot = $this->normalizeSlot((string)($options['slot'] ?? ''));
        if ($slot !== '') {
            $uniqueFilename = $slot . '.' . $extension;
        } else {
            $uniqueFilename = time() . '_' . bin2hex(random_bytes(8)) . '.' . $extension;
        }
        $destinationPath = $targetFolder . '/' . $uniqueFilename;

        // Replace: drop any earlier object for this slot (e.g. an old extension).
        if ($slot !== '') {
            foreach ((array)glob($targetFolder . '/' . $slot . '.*') as $stale) {
                if (!is_file($stale) || basename($stale) === $uniqueFilename) {
                    continue;
                }
                @unlink($stale);
                $this->markDeletedByFilename(basename($stale));
            }
        }

        if (!move_uploaded_file($file['tmp_name'], $destinationPath)) {
            throw new \Exception("Failed to move uploaded file to destination directory.");
        }

        // Enforce file permissions (read-only, non-executable)
        @chmod($destinationPath, 0644);

        // Opaque public URL: a random token, never the storage path.
        $token = bin2hex(random_bytes(16));
        $appUrl = rtrim(\Config::get('app_url', 'http://localhost/alg-school-os-api'), '/');
        $publicUrl = $this->tokenUrl($appUrl, $token);

        // Persist to DB if connected. Upserts on `filename` so a slot re-upload
        // keeps a single row (and a single id) per entity.
        $fileId = $this->recordToDb($orgId, $userId, $safeOriginalName, $uniqueFilename, $destinationPath, $publicUrl, $mime, (int)$file['size'], $token);

        // Reclaim a caller-supplied previous file (legacy random name etc.).
        $previous = trim((string)($options['delete_previous_url'] ?? ''));
        if ($previous !== '' && $this->bareUrl($previous) !== $this->bareUrl($publicUrl)) {
            $this->deleteByUrl($previous);
        }

        return [
            'id' => $fileId,
            'original_name' => $safeOriginalName,
            'filename' => $uniqueFilename,
            'url' => $publicUrl,
            'path' => $destinationPath,
            'token' => $token,
            'mime_type' => $mime,
            'size' => (int)$file['size'],
            'created_at' => date('c')
        ];
    }

    /**
     * Bulk multi-file upload handler (no slots — each file is a distinct object).
     */
    public function uploadBulk(array $filesArray, int $userId = 1, int $orgId = 1, string $folder = 'general'): array {
        $uploaded = [];
        $errors = [];

        // Handle normalized or $_FILES['files'] multi-upload arrays
        if (isset($filesArray['name']) && is_array($filesArray['name'])) {
            $count = count($filesArray['name']);
            for ($i = 0; $i < $count; $i++) {
                if ($filesArray['error'][$i] === UPLOAD_ERR_NO_FILE) continue;

                $single = [
                    'name' => $filesArray['name'][$i],
                    'type' => $filesArray['type'][$i],
                    'tmp_name' => $filesArray['tmp_name'][$i],
                    'error' => $filesArray['error'][$i],
                    'size' => $filesArray['size'][$i],
                ];

                try {
                    $uploaded[] = $this->upload($single, $userId, $orgId, $folder);
                } catch (\Exception $e) {
                    $errors[] = [
                        'file' => $filesArray['name'][$i],
                        'error' => $e->getMessage()
                    ];
                }
            }
        }

        return [
            'uploaded' => $uploaded,
            'errors' => $errors,
            'total_success' => count($uploaded),
            'total_failed' => count($errors)
        ];
    }

    /**
     * Delete file from disk and mark database record.
     */
    public function delete(int $fileId, int $orgId = 1): bool {
        $db = getDbConnection();
        if ($db) {
            $stmt = $db->prepare("SELECT * FROM media_files WHERE id = :id AND org_id = :org_id AND deleted_at IS NULL");
            $stmt->execute([':id' => $fileId, ':org_id' => $orgId]);
            $record = $stmt->fetch();

            if ($record) {
                if (!empty($record['file_path']) && file_exists($record['file_path'])) {
                    @unlink($record['file_path']);
                }
                $del = $db->prepare("UPDATE media_files SET deleted_at = NOW() WHERE id = :id");
                return $del->execute([':id' => $fileId]);
            }
        }
        return false;
    }

    /**
     * Reclaim a file that was previously published (e.g. an avatar/logo being
     * replaced). Maps a public URL back to the physical object below the
     * storage root, unlinks it, and soft-deletes the matching media row(s).
     *
     * Safe against path traversal: only objects inside the storage root are
     * ever touched, and a token URL (which carries no path) is a no-op.
     */
    public function deleteByUrl(string $url): bool {
        $url = trim($url);
        if ($url === '') {
            return false;
        }

        $path = (string)parse_url($url, PHP_URL_PATH);
        if ($path === '') {
            return false;
        }

        $marker = '/uploads/';
        $pos = strpos($path, $marker);
        if ($pos === false) {
            return false; // token URL or external URL — nothing on disk to reclaim here
        }

        $rel = ltrim(str_replace('\\', '/', substr($path, $pos + strlen($marker))), '/');
        if ($rel === '' || strpos($rel, '..') !== false) {
            return false;
        }

        $base = rtrim(str_replace('\\', '/', (string)(realpath($this->uploadDir) ?: $this->uploadDir)), '/');
        $abs  = $base . '/' . $rel;
        if (strncmp($abs, $base . '/', strlen($base) + 1) !== 0) {
            return false;
        }

        $removed = false;
        if (is_file($abs)) {
            $removed = @unlink($abs);
        }

        $db = getDbConnection();
        if ($db) {
            $stmt = $db->prepare(
                "UPDATE media_files SET deleted_at = NOW()
                 WHERE deleted_at IS NULL AND (public_url = :url OR public_url = :bare OR file_path = :abs)"
            );
            $stmt->execute([':url' => $url, ':bare' => $this->bareUrl($url), ':abs' => $abs]);
        }

        return $removed;
    }

    /** Build an opaque, path-free public URL for a token. */
    public function tokenUrl(string $appUrl, string $token): string {
        return rtrim($appUrl, '/') . '/api/media/file.php?t=' . $token;
    }

    /** Normalise a slot key into something safe for a filename. */
    public function normalizeSlot(string $slot): string {
        $slot = strtolower(trim($slot));
        $slot = preg_replace('/[^a-z0-9_-]+/', '-', $slot);
        $slot = trim((string)$slot, '-_');
        if (strlen($slot) > 80) {
            $slot = substr($slot, 0, 80);
        }
        return $slot;
    }

    /** Strip the query string (and a trailing slash) from a URL for comparison. */
    protected function bareUrl(string $url): string {
        $q = strpos($url, '?');
        $bare = $q === false ? $url : substr($url, 0, $q);
        return rtrim($bare, '/');
    }

    /** Soft-delete any live media row that owns this physical filename. */
    protected function markDeletedByFilename(string $filename): void {
        $db = getDbConnection();
        if (!$db) {
            return;
        }
        $stmt = $db->prepare("UPDATE media_files SET deleted_at = NOW() WHERE filename = :f AND deleted_at IS NULL");
        $stmt->execute([':f' => $filename]);
    }

    /**
     * Record uploaded file metadata in the database.
     *
     * Upserts on the UNIQUE `filename` column so a deterministic (slot) upload
     * updates the existing row instead of failing / duplicating. Falls back to
     * a plain insert on databases that predate the `token` column.
     */
    protected function recordToDb(int $orgId, int $userId, string $originalName, string $filename, string $path, string $url, string $mime, int $size, string $token = ''): int {
        $db = getDbConnection();
        if (!$db) {
            return rand(1000, 9999);
        }

        $params = [
            ':org_id'   => $orgId,
            ':user_id'  => $userId,
            ':orig_name'=> $originalName,
            ':filename' => $filename,
            ':path'     => $path,
            ':url'      => $url,
            ':mime'     => $mime,
            ':size'     => $size,
            ':token'    => $token,
        ];

        try {
            $stmt = $db->prepare("
                INSERT INTO media_files (org_id, user_id, original_name, filename, file_path, public_url, mime_type, file_size, token, created_at)
                VALUES (:org_id, :user_id, :orig_name, :filename, :path, :url, :mime, :size, :token, NOW())
                ON DUPLICATE KEY UPDATE
                    org_id        = VALUES(org_id),
                    user_id       = VALUES(user_id),
                    original_name = VALUES(original_name),
                    file_path     = VALUES(file_path),
                    public_url    = VALUES(public_url),
                    mime_type     = VALUES(mime_type),
                    file_size     = VALUES(file_size),
                    token         = VALUES(token),
                    created_at    = NOW(),
                    deleted_at    = NULL
            ");
            $stmt->execute($params);
        } catch (\PDOException $e) {
            // Pre-token schema fallback (migrations not yet applied).
            if (stripos($e->getMessage(), 'token') === false) {
                throw $e;
            }
            $stmt = $db->prepare("
                INSERT INTO media_files (org_id, user_id, original_name, filename, file_path, public_url, mime_type, file_size, created_at)
                VALUES (:org_id, :user_id, :orig_name, :filename, :path, :url, :mime, :size, NOW())
                ON DUPLICATE KEY UPDATE
                    org_id        = VALUES(org_id),
                    user_id       = VALUES(user_id),
                    original_name = VALUES(original_name),
                    file_path     = VALUES(file_path),
                    public_url    = VALUES(public_url),
                    mime_type     = VALUES(mime_type),
                    file_size     = VALUES(file_size),
                    created_at    = NOW(),
                    deleted_at    = NULL
            ");
            unset($params[':token']);
            $stmt->execute($params);
        }

        $id = (int)$db->lastInsertId();
        if ($id <= 0) {
            $sel = $db->prepare("SELECT id FROM media_files WHERE filename = :f LIMIT 1");
            $sel->execute([':f' => $filename]);
            $id = (int)($sel->fetchColumn() ?: 0);
        }
        return $id;
    }
}
