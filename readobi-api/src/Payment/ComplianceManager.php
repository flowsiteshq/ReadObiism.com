<?php
/**
 * ALG School OS - Compliance Manager
 * 
 * Handles Nigerian payment compliance requirements:
 * - CBN (Central Bank of Nigeria) regulations
 * - NDPR (Nigeria Data Protection Regulation)
 * - AML/KYC (Anti-Money Laundering / Know Your Customer)
 * - VAT (Value Added Tax) handling
 * - Transaction limits and reporting
 */

namespace Alg\Payment;

class ComplianceManager {
    protected $db;

    // CBN Transaction Limits (NGN)
    const MIN_TRANSACTION = 100; // ₦100 minimum
    const MAX_SINGLE_TRANSACTION = 20000000; // ₦20M single transaction
    const MAX_DAILY_TRANSACTION = 50000000; // ₦50M daily cumulative
    
    // NDPR Requirements
    const CONSENT_EXPIRY_YEARS = 2;

    public function __construct($db = null) {
        $this->db = $db ?: getDbConnection();
    }

    /**
     * Validate transaction against CBN regulations
     */
    public function validateTransaction(int $orgId, float $amount, string $currency, int $userId): array {
        $violations = [];
        $warnings = [];

        // Currency-specific limits
        if ($currency === 'NGN') {
            // Minimum transaction
            if ($amount < self::MIN_TRANSACTION) {
                $violations[] = "Transaction amount below minimum of ₦" . number_format(self::MIN_TRANSACTION);
            }

            // Single transaction limit
            if ($amount > self::MAX_SINGLE_TRANSACTION) {
                $violations[] = "Transaction exceeds CBN single transaction limit of ₦" . number_format(self::MAX_SINGLE_TRANSACTION);
            }

            // Daily cumulative check
            $dailyTotal = $this->getDailyTransactionTotal($orgId, $userId);
            if ($dailyTotal + $amount > self::MAX_DAILY_TRANSACTION) {
                $violations[] = "Daily transaction limit exceeded. Current: ₦" . number_format($dailyTotal) . ", Attempted: ₦" . number_format($amount);
            }

            // High-value flag (no block, just audit)
            if ($amount >= 5000000) { // ₦5M
                $warnings[] = "High-value transaction flagged for audit";
                \Alg\Audit\AuditLogger::log('compliance.high_value_transaction', 'payment', null, null, [
                    'amount' => $amount, 'org_id' => $orgId, 'user_id' => $userId
                ], $userId, $orgId);
            }
        }

        return [
            'valid' => empty($violations),
            'violations' => $violations,
            'warnings' => $warnings
        ];
    }

    /**
     * Get daily transaction total for a user
     */
    protected function getDailyTransactionTotal(int $orgId, int $userId): float {
        $stmt = $this->db->prepare("
            SELECT COALESCE(SUM(amount), 0) 
            FROM payments 
            WHERE org_id = :org AND user_id = :user 
            AND currency = 'NGN'
            AND status = 'successful'
            AND DATE(created_at) = CURDATE()
        ");
        $stmt->execute([':org' => $orgId, ':user' => $userId]);
        return (float)$stmt->fetchColumn();
    }

    /**
     * Calculate VAT (7.5% in Nigeria)
     */
    public function calculateVAT(float $amount): array {
        $vatRate = $this->getVATRate();
        $vatAmount = round($amount * ($vatRate / 100), 2);
        $totalWithVAT = $amount + $vatAmount;

        return [
            'base_amount' => $amount,
            'vat_rate' => $vatRate,
            'vat_amount' => $vatAmount,
            'total_with_vat' => $totalWithVAT
        ];
    }

    /**
     * Get current VAT rate
     */
    protected function getVATRate(): float {
        $stmt = $this->db->query("SELECT rate FROM tax_configurations WHERE tax_type = 'vat' AND is_active = 1 AND effective_from <= CURDATE() ORDER BY effective_from DESC LIMIT 1");
        $rate = $stmt->fetchColumn();
        return $rate !== false ? (float)$rate : 7.50; // Default 7.5%
    }

    /**
     * Record KYC verification for a user
     */
    public function recordKYC(int $orgId, int $userId, array $details, int $verifiedBy): void {
        $this->db->prepare("
            INSERT INTO compliance_records 
            (org_id, compliance_type, reference_id, reference_type, status, details, verified_by, verified_at, expires_at, created_at)
            VALUES (:org, 'kyc', :user_id, 'user', 'verified', :details, :verified_by, NOW(), DATE_ADD(NOW(), INTERVAL 2 YEAR), NOW())
        ")->execute([
            ':org' => $orgId,
            ':user_id' => $userId,
            ':details' => json_encode($details),
            ':verified_by' => $verifiedBy
        ]);
    }

    /**
     * Check if user has valid KYC
     */
    public function hasValidKYC(int $orgId, int $userId): bool {
        $stmt = $this->db->prepare("
            SELECT COUNT(*) FROM compliance_records 
            WHERE org_id = :org AND reference_id = :user AND reference_type = 'user'
            AND compliance_type = 'kyc' AND status = 'verified'
            AND (expires_at IS NULL OR expires_at > NOW())
        ");
        $stmt->execute([':org' => $orgId, ':user' => $userId]);
        return (int)$stmt->fetchColumn() > 0;
    }

    /**
     * Record NDPR consent (data processing consent)
     */
    public function recordNDPRConsent(int $orgId, int $userId, string $consentType, array $consentDetails): void {
        $expiresAt = date('Y-m-d H:i:s', strtotime('+' . self::CONSENT_EXPIRY_YEARS . ' years'));

        $this->db->prepare("
            INSERT INTO compliance_records 
            (org_id, compliance_type, reference_id, reference_type, status, details, verified_at, expires_at, created_at)
            VALUES (:org, 'ndpr_consent', :user, 'user', 'verified', :details, NOW(), :expires, NOW())
        ")->execute([
            ':org' => $orgId,
            ':user' => $userId,
            ':details' => json_encode(array_merge($consentDetails, ['consent_type' => $consentType])),
            ':expires' => $expiresAt
        ]);
    }

    /**
     * Generate CBN compliance report for a period
     */
    public function generateCBNReport(int $orgId, string $dateFrom, string $dateTo): array {
        // Transaction summary
        $stmt = $this->db->prepare("
            SELECT 
                COUNT(*) as total_transactions,
                COALESCE(SUM(CASE WHEN status = 'successful' THEN amount ELSE 0 END), 0) as total_amount,
                COUNT(CASE WHEN amount >= 5000000 THEN 1 END) as high_value_count,
                COUNT(DISTINCT user_id) as unique_payers
            FROM payments
            WHERE org_id = :org AND created_at BETWEEN :from AND :to
            AND status = 'successful'
        ");
        $stmt->execute([':org' => $orgId, ':from' => $dateFrom, ':to' => $dateTo]);
        $summary = $stmt->fetch(\PDO::FETCH_ASSOC);

        // High-value transactions (>= ₦5M)
        $highValue = $this->db->prepare("
            SELECT p.id, p.amount, p.currency, p.created_at, u.email, u.name
            FROM payments p
            LEFT JOIN users u ON u.id = p.user_id
            WHERE p.org_id = :org AND p.created_at BETWEEN :from AND :to
            AND p.status = 'successful' AND p.amount >= 5000000
            ORDER BY p.amount DESC
        ");
        $highValue->execute([':org' => $orgId, ':from' => $dateFrom, ':to' => $dateTo]);

        return [
            'report_period' => ['from' => $dateFrom, 'to' => $dateTo],
            'summary' => $summary,
            'high_value_transactions' => $highValue->fetchAll(\PDO::FETCH_ASSOC),
            'generated_at' => date('Y-m-d H:i:s')
        ];
    }

    /**
     * Validate bank account (NUBAN validation)
     */
    public function validateBankAccount(string $accountNumber, string $bankCode): array {
        // Basic NUBAN validation (10 digits)
        if (!preg_match('/^\d{10}$/', $accountNumber)) {
            return ['valid' => false, 'error' => 'Invalid account number format. Must be 10 digits.'];
        }

        // Resolve bank name via Paystack API
        $secretKey = \Alg\Payment\GatewayConfig::secret('paystack');
        if (!empty($secretKey)) {
            $ch = curl_init("https://api.paystack.co/bank/resolve?account_number={$accountNumber}&bank_code={$bankCode}");
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_HTTPHEADER, ["Authorization: Bearer {$secretKey}"]);
            curl_setopt($ch, CURLOPT_TIMEOUT, 10);
            $res = curl_exec($ch);
            curl_close($ch);
            $data = json_decode($res, true);

            if (!empty($data['data']['account_name'])) {
                return [
                    'valid' => true,
                    'account_name' => $data['data']['account_name'],
                    'bank_code' => $bankCode
                ];
            }
        }

        return ['valid' => true, 'account_name' => null]; // Assume valid if can't verify
    }

    /**
     * Get compliance status for an organization
     */
    public function getComplianceStatus(int $orgId): array {
        $kycCount = $this->db->prepare("SELECT COUNT(*) FROM compliance_records WHERE org_id = :org AND compliance_type = 'kyc' AND status = 'verified'");
        $kycCount->execute([':org' => $orgId]);

        $ndprCount = $this->db->prepare("SELECT COUNT(*) FROM compliance_records WHERE org_id = :org AND compliance_type = 'ndpr_consent' AND status = 'verified'");
        $ndprCount->execute([':org' => $orgId]);

        $expiringKYC = $this->db->prepare("SELECT COUNT(*) FROM compliance_records WHERE org_id = :org AND compliance_type = 'kyc' AND status = 'verified' AND expires_at BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 30 DAY)");
        $expiringKYC->execute([':org' => $orgId]);

        return [
            'kyc_verified_count' => (int)$kycCount->fetchColumn(),
            'ndpr_consent_count' => (int)$ndprCount->fetchColumn(),
            'expiring_kyc_count' => (int)$expiringKYC->fetchColumn(),
            'last_report_date' => date('Y-m-d')
        ];
    }
}
