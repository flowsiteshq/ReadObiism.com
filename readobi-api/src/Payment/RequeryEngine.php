<?php
/**
 * ALG School OS - Requery Engine
 * 
 * Automatically re-verifies pending transactions with payment gateways.
 * Uses exponential backoff to retry failed verifications.
 * 
 * Features:
 * - Automatic requery via cron job
 * - Exponential backoff (1min, 5min, 15min, 1hr, 4hr, 12hr, 24hr)
 * - Maximum retry limit
 * - Manual requery endpoint
 * - Idempotent processing
 */

namespace Alg\Payment;

class RequeryEngine {
    protected $db;
    protected $paymentManager;

    // Exponential backoff schedule in minutes
    const BACKOFF_SCHEDULE = [1, 5, 15, 60, 240, 720, 1440];
    const MAX_ATTEMPTS = 10;

    public function __construct($db = null) {
        $this->db = $db ?: getDbConnection();
        $this->paymentManager = new PaymentManager($this->db);
    }

    /**
     * Queue a payment for requery
     */
    public function queueForRequery(int $paymentId): void {
        $stmt = $this->db->prepare("SELECT * FROM payments WHERE id = :id AND status = 'pending'");
        $stmt->execute([':id' => $paymentId]);
        $payment = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$payment) return;

        // Check if already queued
        $existing = $this->db->prepare("SELECT * FROM payment_requery_queue WHERE payment_id = :pid AND status IN ('pending', 'processing')");
        $existing->execute([':pid' => $paymentId]);
        if ($existing->fetch()) return;

        $nextAttempt = date('Y-m-d H:i:s', strtotime('+1 minute'));

        $this->db->prepare("
            INSERT INTO payment_requery_queue 
            (payment_id, reference, provider, attempt_count, max_attempts, next_attempt_at, status, created_at)
            VALUES (:pid, :ref, :provider, 0, :max, :next, 'pending', NOW())
        ")->execute([
            ':pid' => $paymentId,
            ':ref' => $payment['reference'],
            ':provider' => $payment['provider'],
            ':max' => self::MAX_ATTEMPTS,
            ':next' => $nextAttempt
        ]);
    }

    /**
     * Process pending requery jobs (called by cron)
     */
    public function processPendingRequeries(int $limit = 50): array {
        $stmt = $this->db->prepare("
            SELECT * FROM payment_requery_queue 
            WHERE status IN ('pending', 'processing') 
            AND next_attempt_at <= NOW()
            ORDER BY next_attempt_at ASC
            LIMIT :limit
        ");
        $stmt->bindValue(':limit', $limit, \PDO::PARAM_INT);
        $stmt->execute();
        $pendingRequeries = $stmt->fetchAll(\PDO::FETCH_ASSOC);

        $results = [];
        foreach ($pendingRequeries as $requery) {
            $results[] = $this->processRequery((int)$requery['id']);
        }

        return $results;
    }

    /**
     * Process a single requery
     */
    public function processRequery(int $requeryId): array {
        $stmt = $this->db->prepare("SELECT * FROM payment_requery_queue WHERE id = :id");
        $stmt->execute([':id' => $requeryId]);
        $requery = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$requery) return ['error' => 'Requery not found'];

        // Mark as processing
        $this->db->prepare("UPDATE payment_requery_queue SET status = 'processing', last_attempt_at = NOW() WHERE id = :id")
            ->execute([':id' => $requeryId]);

        try {
            // Verify with gateway
            $result = $this->paymentManager->verify($requery['provider'], $requery['reference']);

            // Update payment record
            $this->db->prepare("UPDATE payments SET requery_count = requery_count + 1, last_requery_at = NOW() WHERE id = :id")
                ->execute([':id' => $requery['payment_id']]);

            // Update requery status
            $newStatus = $result['status'] === 'successful' ? 'completed' : ($requery['attempt_count'] + 1 >= self::MAX_ATTEMPTS ? 'abandoned' : 'pending');
            $nextAttempt = $newStatus === 'pending' 
                ? $this->calculateNextAttempt($requery['attempt_count'] + 1)
                : null;

            $this->db->prepare("
                UPDATE payment_requery_queue 
                SET status = :status, attempt_count = attempt_count + 1, 
                    next_attempt_at = :next, last_response = :response
                WHERE id = :id
            ")->execute([
                ':status' => $newStatus,
                ':next' => $nextAttempt,
                ':response' => json_encode($result),
                ':id' => $requeryId
            ]);

            // Log transaction
            $this->logTransaction($requery['payment_id'], 'requery_attempted', null, $result['status'], null, null, $result);

            return [
                'requery_id' => $requeryId,
                'payment_id' => $requery['payment_id'],
                'reference' => $requery['reference'],
                'status' => $result['status'],
                'next_attempt' => $nextAttempt
            ];

        } catch (\Throwable $e) {
            $newStatus = $requery['attempt_count'] + 1 >= self::MAX_ATTEMPTS ? 'abandoned' : 'pending';
            $nextAttempt = $newStatus === 'pending' 
                ? $this->calculateNextAttempt($requery['attempt_count'] + 1)
                : null;

            $this->db->prepare("
                UPDATE payment_requery_queue 
                SET status = :status, attempt_count = attempt_count + 1, 
                    next_attempt_at = :next, last_response = :response, error_message = :error
                WHERE id = :id
            ")->execute([
                ':status' => $newStatus,
                ':next' => $nextAttempt,
                ':response' => null,
                ':error' => $e->getMessage(),
                ':id' => $requeryId
            ]);

            return ['requery_id' => $requeryId, 'error' => $e->getMessage()];
        }
    }

    /**
     * Manual requery for a specific payment
     */
    public function manualRequery(int $paymentId): array {
        $stmt = $this->db->prepare("SELECT * FROM payments WHERE id = :id");
        $stmt->execute([':id' => $paymentId]);
        $payment = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$payment) {
            throw new \Exception('Payment not found');
        }

        // Queue if not already queued
        $this->queueForRequery($paymentId);

        // Get the requery ID
        $requeryStmt = $this->db->prepare("SELECT id FROM payment_requery_queue WHERE payment_id = :pid ORDER BY id DESC LIMIT 1");
        $requeryStmt->execute([':pid' => $paymentId]);
        $requeryId = (int)$requeryStmt->fetchColumn();

        return $this->processRequery($requeryId);
    }

    /**
     * Calculate next attempt time using exponential backoff
     */
    protected function calculateNextAttempt(int $attemptCount): ?string {
        if ($attemptCount >= self::MAX_ATTEMPTS) return null;
        $index = min($attemptCount, count(self::BACKOFF_SCHEDULE) - 1);
        $minutes = self::BACKOFF_SCHEDULE[$index];
        return date('Y-m-d H:i:s', strtotime("+{$minutes} minutes"));
    }

    /**
     * Get statistics on requery queue
     */
    public function getStats(): array {
        $stats = $this->db->query("
            SELECT 
                status,
                COUNT(*) as count,
                AVG(attempt_count) as avg_attempts
            FROM payment_requery_queue
            GROUP BY status
        ")->fetchAll(\PDO::FETCH_ASSOC);

        $pending = $this->db->query("SELECT COUNT(*) FROM payment_requery_queue WHERE status = 'pending' AND next_attempt_at <= NOW()")->fetchColumn();

        return [
            'by_status' => $stats,
            'pending_now' => (int)$pending
        ];
    }

    protected function logTransaction(?int $paymentId, string $event, ?string $from, ?string $to, ?float $amount, ?string $currency, ?array $response): void {
        try {
            $this->db->prepare("
                INSERT INTO payment_transaction_log 
                (payment_id, event_type, status_from, status_to, amount, currency, gateway_response, created_at)
                VALUES (:pid, :event, :from, :to, :amount, :currency, :response, NOW())
            ")->execute([
                ':pid' => $paymentId,
                ':event' => $event,
                ':from' => $from,
                ':to' => $to,
                ':amount' => $amount,
                ':currency' => $currency ?? 'NGN',
                ':response' => $response ? json_encode($response) : null
            ]);
        } catch (\Throwable $e) {}
    }
}
