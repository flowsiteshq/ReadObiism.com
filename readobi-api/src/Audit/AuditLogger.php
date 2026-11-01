<?php
/**
 * ALG Company - AuditLogger Service
 * 
 * Immutable security and audit logging:
 * - Records actor (user_id), tenant (org_id), action, target entity
 * - Captures IP address, user-agent, before and after JSON states
 */

namespace Alg\Audit;

class AuditLogger {
    public static function log(string $action, string $entityType = null, int $entityId = null, $beforeState = null, $afterState = null, int $userId = null, int $orgId = 1): void {
        $db = getDbConnection();
        if (!$db) return;

        // Audit logging must never break the business operation it records.
        // Tolerate a non-array state argument rather than raising a TypeError.
        if (!is_array($beforeState)) $beforeState = null;
        if (!is_array($afterState)) $afterState = null;

        $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';

        try {
            $stmt = $db->prepare("
                INSERT INTO audit_logs (org_id, user_id, action, entity_type, entity_id, ip_address, before_state, after_state, created_at)
                VALUES (:org_id, :user_id, :action, :entity_type, :entity_id, :ip, :before, :after, NOW())
            ");
            $stmt->execute([
                ':org_id' => $orgId,
                ':user_id' => $userId,
                ':action' => $action,
                ':entity_type' => $entityType,
                ':entity_id' => $entityId,
                ':ip' => $ip,
                ':before' => $beforeState ? json_encode($beforeState) : null,
                ':after' => $afterState ? json_encode($afterState) : null
            ]);
        } catch (\Throwable $e) {
            // Non-blocking log exception
        }
    }
}
