<?php
/**
 * ALG Company - AuthManager Service
 * 
 * Enterprise authentication engine:
 * - JWT access tokens & refresh tokens with rotation
 * - Password hashing (bcrypt cost 12) & verification
 * - OTP 6-digit expiring code generation & validation
 * - RBAC permission checks & role inheritance
 */

namespace Alg\Security;

class AuthManager {
    protected $db;
    protected $jwtSecret;
    protected $jwtExpiry;
    protected $refreshExpiry;

    public function __construct($db = null, $secret = null) {
        $this->db = $db ?: getDbConnection();
        $this->jwtSecret = $secret ?: \Config::get('jwt_secret');
        $this->jwtExpiry = \Config::get('jwt_expiry', 86400); // 24 hours
        $this->refreshExpiry = 86400 * 30; // 30 days
    }

    /**
     * Hash password securely using BCRYPT
     */
    public function hashPassword(string $password): string {
        return password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
    }

    /**
     * Verify plain password against hash
     */
    public function verifyPassword(string $password, ?string $hash): bool {
        if ($hash === null || $hash === '') {
            return false;
        }
        return password_verify($password, $hash);
    }

    /**
     * Generate JWT Access Token
     */
    public function generateAccessToken(int $userId, string $role = 'user', int $orgId = 1, array $permissions = []): string {
        $header = json_encode(['typ' => 'JWT', 'alg' => 'HS256']);
        $payload = json_encode([
            'sub' => $userId,
            'role' => $role,
            'org_id' => $orgId,
            'permissions' => $permissions,
            'iat' => time(),
            'exp' => time() + $this->jwtExpiry,
            'jti' => bin2hex(random_bytes(16))
        ]);

        $base64Header = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($header));
        $base64Payload = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($payload));
        $signature = hash_hmac('sha256', "{$base64Header}.{$base64Payload}", $this->jwtSecret, true);
        $base64Signature = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($signature));

        return "{$base64Header}.{$base64Payload}.{$base64Signature}";
    }

    /**
     * Generate Refresh Token and store in DB
     */
    public function generateRefreshToken(int $userId, int $orgId = 1): string {
        $token = bin2hex(random_bytes(32));
        $expiresAt = date('Y-m-d H:i:s', time() + $this->refreshExpiry);

        if ($this->db) {
            $stmt = $this->db->prepare("
                INSERT INTO refresh_tokens (user_id, org_id, token, expires_at, created_at)
                VALUES (:user_id, :org_id, :token, :expires_at, NOW())
            ");
            $stmt->execute([
                ':user_id' => $userId,
                ':org_id' => $orgId,
                ':token' => hash('sha256', $token),
                ':expires_at' => $expiresAt
            ]);
        }

        return $token;
    }

    /**
     * Validate Refresh Token and return user
     */
    public function validateRefreshToken(string $token): ?array {
        if (!$this->db) {
            return null;
        }

        $hash = hash('sha256', $token);
        $stmt = $this->db->prepare("
            SELECT rt.*, u.id as user_id, u.email, u.name, u.role, u.status, u.org_id
            FROM refresh_tokens rt
            JOIN users u ON u.id = rt.user_id
            WHERE rt.token = :hash AND rt.revoked = 0 AND rt.expires_at > NOW()
            LIMIT 1
        ");
        $stmt->execute([':hash' => $hash]);
        $row = $stmt->fetch();

        return $row ?: null;
    }

    /**
     * Revoke a refresh token (Logout)
     */
    public function revokeRefreshToken(string $token): bool {
        if (!$this->db) return true;
        $hash = hash('sha256', $token);
        $stmt = $this->db->prepare("UPDATE refresh_tokens SET revoked = 1 WHERE token = :hash");
        return $stmt->execute([':hash' => $hash]);
    }

    /**
     * Verify Access Token payload
     */
    public function verifyAccessToken(string $token): ?array {
        $parts = explode('.', $token);
        if (count($parts) !== 3) return null;

        list($b64Header, $b64Payload, $b64Signature) = $parts;
        $expectedSignature = hash_hmac('sha256', "{$b64Header}.{$b64Payload}", $this->jwtSecret, true);
        $expectedB64 = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($expectedSignature));

        if (!hash_equals($expectedB64, $b64Signature)) {
            return null;
        }

        $payload = json_decode(base64_decode(str_replace(['-', '_'], ['+', '/'], $b64Payload)), true);
        if (!$payload || ($payload['exp'] ?? 0) < time()) {
            return null;
        }

        return $payload;
    }

    /**
     * Generate 6-digit expiring OTP code
     */
    public function generateOtp(int $userId, string $purpose = 'login'): string {
        $code = str_pad((string)random_int(100000, 999999), 6, '0', STR_PAD_LEFT);
        $expiresAt = date('Y-m-d H:i:s', time() + 600); // 10 minutes

        if ($this->db) {
            $stmt = $this->db->prepare("
                INSERT INTO otp_codes (user_id, code, purpose, expires_at, created_at)
                VALUES (:user_id, :code, :purpose, :expires_at, NOW())
            ");
            $stmt->execute([
                ':user_id' => $userId,
                ':code' => hash('sha256', $code),
                ':purpose' => $purpose,
                ':expires_at' => $expiresAt
            ]);
        }

        return $code;
    }

    /**
     * Verify 6-digit OTP code
     */
    public function verifyOtp(int $userId, string $code, string $purpose = 'login'): bool {
        if (!$this->db) return false;

        $hash = hash('sha256', $code);
        $stmt = $this->db->prepare("
            SELECT id FROM otp_codes
            WHERE user_id = :user_id AND code = :code AND purpose = :purpose AND used = 0 AND expires_at > NOW()
            ORDER BY id DESC LIMIT 1
        ");
        $stmt->execute([
            ':user_id' => $userId,
            ':code' => $hash,
            ':purpose' => $purpose
        ]);
        $row = $stmt->fetch();

        if ($row) {
            $this->db->prepare("UPDATE otp_codes SET used = 1 WHERE id = :id")->execute([':id' => $row['id']]);
            return true;
        }

        return false;
    }

    /**
     * Check if user has permission
     */
    public function hasPermission(array $user, string $permissionKey): bool {
        if (($user['role'] ?? '') === 'super_admin') return true;
        $permissions = $user['permissions'] ?? [];
        return in_array($permissionKey, $permissions) || in_array('*', $permissions);
    }
}
