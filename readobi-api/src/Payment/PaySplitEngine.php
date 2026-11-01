<?php
/**
 * ALG School OS - PaySplit Engine
 * 
 * Handles payment splitting between multiple recipients (school, platform, vendors)
 * Supports Paystack Splits, Flutterwave Subaccounts, and internal splits
 * 
 * Features:
 * - Percentage-based and fixed-amount splits
 * - Automatic split execution on payment success
 * - Split tracking and reconciliation
 * - Multi-gateway support
 */

namespace Alg\Payment;

class PaySplitEngine {
    protected $db;
    protected $paymentManager;

    public function __construct($db = null) {
        $this->db = $db ?: getDbConnection();
        $this->paymentManager = new PaymentManager($this->db);
    }

    /**
     * Create a payment split configuration
     */
    public function createSplit(int $orgId, string $name, string $splitType, string $provider, array $recipients, int $createdBy, ?string $description = null): array {
        $this->db->beginTransaction();
        try {
            // Validate split type
            if (!in_array($splitType, ['percentage', 'fixed_amount'])) {
                throw new \Exception('Invalid split type. Use: percentage or fixed_amount');
            }

            // Validate total shares for percentage splits
            if ($splitType === 'percentage') {
                $totalPercentage = array_sum(array_column($recipients, 'share_value'));
                if (abs($totalPercentage - 100) > 0.01) {
                    throw new \Exception("Percentage shares must total 100%. Current total: {$totalPercentage}%");
                }
            }

            // Create split record
            $stmt = $this->db->prepare("
                INSERT INTO payment_splits (org_id, name, description, split_type, provider, is_active, created_by, created_at)
                VALUES (:org_id, :name, :description, :split_type, :provider, 1, :created_by, NOW())
            ");
            $stmt->execute([
                ':org_id' => $orgId,
                ':name' => $name,
                ':description' => $description,
                ':split_type' => $splitType,
                ':provider' => $provider,
                ':created_by' => $createdBy
            ]);
            $splitId = (int)$this->db->lastInsertId();

            // Create recipients
            foreach ($recipients as $recipient) {
                $stmt = $this->db->prepare("
                    INSERT INTO payment_split_recipients 
                    (split_id, recipient_type, recipient_name, recipient_email, bank_account_id, share_value, description, is_active, created_at)
                    VALUES (:split_id, :type, :name, :email, :bank_id, :share, :desc, 1, NOW())
                ");
                $stmt->execute([
                    ':split_id' => $splitId,
                    ':type' => $recipient['recipient_type'],
                    ':name' => $recipient['recipient_name'],
                    ':email' => $recipient['recipient_email'] ?? null,
                    ':bank_id' => $recipient['bank_account_id'] ?? null,
                    ':share' => $recipient['share_value'],
                    ':desc' => $recipient['description'] ?? null
                ]);
            }

            // If provider is Paystack/Flutterwave, create split on gateway
            $gatewaySplitId = null;
            if ($provider === 'paystack') {
                $gatewaySplitId = $this->createPaystackSplit($orgId, $splitId, $name, $recipients);
            } elseif ($provider === 'flutterwave') {
                $gatewaySplitId = $this->createFlutterwaveSubaccount($orgId, $splitId, $name, $recipients);
            }

            // Update gateway_split_id
            if ($gatewaySplitId) {
                $this->db->prepare("UPDATE payment_splits SET gateway_split_id = :gid WHERE id = :id")
                    ->execute([':gid' => $gatewaySplitId, ':id' => $splitId]);
            }

            $this->db->commit();

            return [
                'id' => $splitId,
                'org_id' => $orgId,
                'name' => $name,
                'split_type' => $splitType,
                'provider' => $provider,
                'gateway_split_id' => $gatewaySplitId,
                'recipients' => $recipients
            ];

        } catch (\Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    /**
     * Ensure the school has a live Paystack split wired to its settlement
     * account. Called automatically when a payment is initialised so a school
     * never has to touch the dashboard to start receiving split payments.
     *
     * @return array{id:int,gateway_split_id:?string,commission_rate:float}|null
     */
    public function ensureSchoolSplit(int $orgId, int $createdBy = 0): ?array {
        if ($orgId <= 0) {
            return null;
        }

        // 1. Reuse an existing live split for this school.
        try {
            $stmt = $this->db->prepare("
                SELECT id, gateway_split_id, commission_rate
                  FROM payment_splits
                 WHERE org_id = :org AND provider = 'paystack' AND is_active = 1
                   AND gateway_split_id IS NOT NULL AND gateway_split_id <> ''
                 ORDER BY id DESC LIMIT 1
            ");
            $stmt->execute([':org' => $orgId]);
            $existing = $stmt->fetch(\PDO::FETCH_ASSOC);
            $isSimulatedSplit = $existing
                && \Alg\Payment\GatewayConfig::mode('paystack') === 'live'
                && strpos((string) ($existing['gateway_split_id'] ?? ''), 'SPL_AUTO_') === 0;
            if ($existing && !$isSimulatedSplit) {
                return [
                    'id' => (int) $existing['id'],
                    'gateway_split_id' => (string) $existing['gateway_split_id'],
                    'commission_rate' => (float) ($existing['commission_rate'] ?? $this->effectiveCommissionRate($orgId)),
                ];
            }
        } catch (\Throwable $e) {
            // Fall through to provisioning.
        }

        // 2. Find the school's settlement account.
        try {
            $stmt = $this->db->prepare("
                SELECT * FROM school_bank_accounts
                 WHERE org_id = :org AND deleted_at IS NULL AND status = 'active'
                 ORDER BY is_default DESC, is_verified DESC, id ASC
                 LIMIT 1
            ");
            $stmt->execute([':org' => $orgId]);
            $bank = $stmt->fetch(\PDO::FETCH_ASSOC);
        } catch (\Throwable $e) {
            return null;
        }

        if (!$bank) {
            return null;
        }

        // 3. Provision it.
        $rate = $this->effectiveCommissionRate($orgId);
        $schoolShare = round(100 - $rate, 2);
        if ($schoolShare <= 0 || $schoolShare > 100) {
            return null;
        }

        try {
            $split = $this->createSplit(
                $orgId,
                'Auto split · ' . ($bank['bank_name'] ?? 'Settlement'),
                'percentage',
                'paystack',
                [
                    [
                        'recipient_type' => 'school',
                        'recipient_name' => $bank['account_name'],
                        'bank_account_id' => (int) $bank['id'],
                        'share_value' => $schoolShare,
                        'description' => 'School settlement account',
                    ],
                    [
                        'recipient_type' => 'platform',
                        'recipient_name' => 'ALG Platform',
                        'share_value' => $rate,
                        'description' => 'Platform commission',
                    ],
                ],
                $createdBy,
                'Created automatically so fee payments reach the school instantly.'
            );

            if (empty($split['gateway_split_id'])) {
                $isDev = in_array(alg_env('APP_ENV', 'production'), ['development', 'local', 'testing'], true)
                    || \Alg\Payment\GatewayConfig::mode('paystack') !== 'live'
                    || empty(\Alg\Payment\GatewayConfig::secret('paystack'));
                if ($isDev) {
                    $testSplitCode = 'SPL_AUTO_' . strtoupper(substr(md5((string)$split['id']), 0, 8));
                    $this->db->prepare("UPDATE payment_splits SET gateway_split_id = :gid WHERE id = :id")
                        ->execute([':gid' => $testSplitCode, ':id' => (int)$split['id']]);
                    $split['gateway_split_id'] = $testSplitCode;
                } else {
                    $splitId = (int) $split['id'];
                    $this->db->prepare("DELETE FROM payment_split_assignments WHERE split_id = :id")->execute([':id' => $splitId]);
                    $this->db->prepare("DELETE FROM payment_split_recipients WHERE split_id = :id")->execute([':id' => $splitId]);
                    $this->db->prepare("DELETE FROM payment_splits WHERE id = :id AND gateway_split_id IS NULL")->execute([':id' => $splitId]);

                    \Alg\Audit\AuditLogger::log('payment.split_gateway_rejected', 'payment_split', null, null, [
                        'org_id' => $orgId,
                        'bank_account_id' => (int) $bank['id'],
                    ], $createdBy ?: null, $orgId);

                    return null;
                }
            }

            $this->assignSplit((int) $split['id'], 'global', $orgId, 0);

            $this->db->prepare("UPDATE payment_splits SET commission_rate = :rate WHERE id = :id")
                ->execute([':rate' => $rate, ':id' => (int) $split['id']]);

            return [
                'id' => (int) $split['id'],
                'gateway_split_id' => $split['gateway_split_id'] ?? null,
                'commission_rate' => $rate,
            ];
        } catch (\Throwable $e) {
            \Alg\Audit\AuditLogger::log('payment.split_auto_provision_failed', 'payment_split', null, null, [
                'org_id' => $orgId,
                'error' => $e->getMessage(),
            ], null, $orgId);
            return null;
        }
    }

    /**
     * Effective ALG commission for a school: per-school override, then the
     * platform default. Returns a sane 5% if the settings table is missing.
     */
    public function effectiveCommissionRate(int $orgId): float {
        try {
            $stmt = $this->db->prepare("SELECT value FROM platform_settings WHERE setting_key = :key LIMIT 1");
            $stmt->execute([':key' => 'commission_org_' . $orgId]);
            $value = $stmt->fetchColumn();

            if ($value === false || $value === null || $value === '') {
                $stmt->execute([':key' => 'default_commission_rate']);
                $value = $stmt->fetchColumn();
            }

            $rate = ($value === false || $value === null || $value === '') ? 5.0 : (float) $value;
            return max(0.0, min(100.0, $rate));
        } catch (\Throwable $e) {
            return 5.0;
        }
    }

    /**
     * Assign split to fee categories or invoices
     */
    public function assignSplit(int $splitId, string $assignmentType, ?int $assignmentId = null, int $priority = 0): void {
        if (!in_array($assignmentType, ['fee_category', 'fee_item', 'invoice', 'global'])) {
            throw new \Exception('Invalid assignment type');
        }

        $stmt = $this->db->prepare("
            INSERT INTO payment_split_assignments (split_id, assignment_type, assignment_id, priority, created_at)
            VALUES (:split_id, :type, :assignment_id, :priority, NOW())
        ");
        $stmt->execute([
            ':split_id' => $splitId,
            ':type' => $assignmentType,
            ':assignment_id' => $assignmentId,
            ':priority' => $priority
        ]);
    }

    /**
     * Execute split for a successful payment
     */
    public function executeSplit(int $paymentId, float $amount): array {
        $payment = $this->db->prepare("SELECT * FROM payments WHERE id = :id");
        $payment->execute([':id' => $paymentId]);
        $payment = $payment->fetch(\PDO::FETCH_ASSOC);

        if (!$payment) {
            throw new \Exception('Payment not found');
        }

        // Find applicable split
        $split = $this->findApplicableSplit($payment);
        if (!$split) {
            return ['status' => 'no_split', 'message' => 'No split configuration found'];
        }

        $this->db->beginTransaction();
        try {
            // Create split transaction record
            $stmt = $this->db->prepare("
                INSERT INTO payment_split_transactions 
                (split_id, payment_id, original_amount, status, created_at)
                VALUES (:split_id, :payment_id, :amount, 'pending', NOW())
            ");
            $stmt->execute([
                ':split_id' => $split['id'],
                ':payment_id' => $paymentId,
                ':amount' => $amount
            ]);
            $splitTxnId = (int)$this->db->lastInsertId();

            // Calculate distributions
            $recipients = $this->getSplitRecipients($split['id']);
            $distributions = [];
            
            foreach ($recipients as $recipient) {
                $shareAmount = $this->calculateShareAmount($amount, $recipient, $split['split_type']);
                
                $stmt = $this->db->prepare("
                    INSERT INTO payment_split_distributions 
                    (split_transaction_id, recipient_id, amount, share_percentage, status, created_at)
                    VALUES (:txn_id, :recipient_id, :amount, :percentage, 'pending', NOW())
                ");
                $stmt->execute([
                    ':txn_id' => $splitTxnId,
                    ':recipient_id' => $recipient['id'],
                    ':amount' => $shareAmount,
                    ':percentage' => $split['split_type'] === 'percentage' ? $recipient['share_value'] : null
                ]);
                
                $distributions[] = [
                    'recipient_id' => $recipient['id'],
                    'recipient_name' => $recipient['recipient_name'],
                    'amount' => $shareAmount
                ];
            }

            // Execute split on gateway
            if ($split['provider'] === 'paystack') {
                $this->executePaystackSplit($payment, $split, $splitTxnId);
            } elseif ($split['provider'] === 'flutterwave') {
                $this->executeFlutterwaveSplit($payment, $split, $splitTxnId);
            } else {
                // Internal split (manual tracking)
                $this->db->prepare("UPDATE payment_split_transactions SET status = 'executed', split_executed_at = NOW() WHERE id = :id")
                    ->execute([':id' => $splitTxnId]);
            }

            // Update payment record
            $this->db->prepare("UPDATE payments SET split_id = :split_id, split_executed = 1 WHERE id = :id")
                ->execute([':split_id' => $split['id'], ':id' => $paymentId]);

            $this->db->commit();

            return [
                'status' => 'executed',
                'split_id' => $split['id'],
                'split_transaction_id' => $splitTxnId,
                'original_amount' => $amount,
                'distributions' => $distributions
            ];

        } catch (\Throwable $e) {
            $this->db->rollBack();
            \Alg\Audit\AuditLogger::log('payment.split_failed', 'payment', $paymentId, null, [
                'split_id' => $split['id'] ?? null,
                'error' => $e->getMessage()
            ], (int)$payment['user_id'], (int)$payment['org_id']);
            throw $e;
        }
    }

    /**
     * Find applicable split for a payment
     */
    protected function findApplicableSplit(array $payment): ?array {
        // Priority: invoice > fee_item > fee_category > global
        if (!empty($payment['invoice_id'])) {
            $stmt = $this->db->prepare("
                SELECT ps.* FROM payment_splits ps
                JOIN payment_split_assignments psa ON psa.split_id = ps.id
                WHERE psa.assignment_type = 'invoice' AND psa.assignment_id = :invoice_id
                AND ps.is_active = 1
                ORDER BY psa.priority DESC
                LIMIT 1
            ");
            $stmt->execute([':invoice_id' => $payment['invoice_id']]);
            $split = $stmt->fetch(\PDO::FETCH_ASSOC);
            if ($split) return $split;
        }

        // TODO: Check fee_item and fee_category assignments

        // Fall back to global split
        $stmt = $this->db->prepare("
            SELECT ps.* FROM payment_splits ps
            JOIN payment_split_assignments psa ON psa.split_id = ps.id
            WHERE psa.assignment_type = 'global' AND ps.org_id = :org_id
            AND ps.is_active = 1
            ORDER BY psa.priority DESC
            LIMIT 1
        ");
        $stmt->execute([':org_id' => $payment['org_id']]);
        $split = $stmt->fetch(\PDO::FETCH_ASSOC);
        if ($split) return $split;

        // Last resort: the school's newest active split, even if it was never
        // explicitly assigned. Auto-provisioned splits rely on this.
        $stmt = $this->db->prepare("
            SELECT * FROM payment_splits
             WHERE org_id = :org_id AND is_active = 1
             ORDER BY (gateway_split_id IS NOT NULL) DESC, id DESC
             LIMIT 1
        ");
        $stmt->execute([':org_id' => $payment['org_id']]);
        return $stmt->fetch(\PDO::FETCH_ASSOC) ?: null;
    }

    protected function getSplitRecipients(int $splitId): array {
        $stmt = $this->db->prepare("SELECT * FROM payment_split_recipients WHERE split_id = :id AND is_active = 1");
        $stmt->execute([':id' => $splitId]);
        return $stmt->fetchAll(\PDO::FETCH_ASSOC);
    }

    protected function calculateShareAmount(float $totalAmount, array $recipient, string $splitType): float {
        if ($splitType === 'percentage') {
            return round($totalAmount * ($recipient['share_value'] / 100), 2);
        } else {
            return min((float)$recipient['share_value'], $totalAmount);
        }
    }

    /**
     * Create Paystack Split Payment (Subaccount)
     * This creates a subaccount for the school so Paystack auto-splits payments
     */
    protected function createPaystackSplit(int $orgId, int $splitId, string $name, array $recipients): ?string {
        $secretKey = \Alg\Payment\GatewayConfig::secret('paystack');
        if (empty($secretKey)) return null;

        // Find the school recipient (the main recipient who gets the bulk)
        $schoolRecipient = null;
        foreach ($recipients as $recipient) {
            if ($recipient['recipient_type'] === 'school' && !empty($recipient['bank_account_id'])) {
                $schoolRecipient = $recipient;
                break;
            }
        }

        if (!$schoolRecipient) {
            // No school recipient, skip subaccount creation
            return null;
        }

        // Get school's bank account
        $bankAccount = $this->db->prepare("SELECT * FROM school_bank_accounts WHERE id = :id");
        $bankAccount->execute([':id' => $schoolRecipient['bank_account_id']]);
        $bankAccount = $bankAccount->fetch(\PDO::FETCH_ASSOC);

        if (!$bankAccount) return null;

        // Create Paystack Subaccount for the school
        // https://paystack.com/docs/api/split/#create-a-split
        // NOTE: Paystack has no `primary_share` field — whatever is not
        // allocated to a subaccount stays in the master (ALG) account.
        $subaccountCode = $this->getOrCreateSubaccount($bankAccount, $secretKey);
        if (!$subaccountCode) {
            return null;
        }

        $payload = [
            'name' => $name,
            'type' => 'percentage',
            'currency' => 'NGN',
            'subaccounts' => [
                [
                    'subaccount' => $subaccountCode,
                    'share' => (float) $schoolRecipient['share_value']
                ]
            ],
            'bearer_type' => 'subaccount', // School bears the transaction fee
            'bearer_subaccount' => $subaccountCode
        ];

        $response = $this->curlRequest("https://api.paystack.co/split", 'POST', $payload, [
            "Authorization: Bearer {$secretKey}",
            "Content-Type: application/json"
        ]);

        if (!empty($response['data']['split_code'])) {
            $splitCode = $response['data']['split_code'];
            
            // Update all recipients with the split code
            foreach ($recipients as $recipient) {
                $this->db->prepare("UPDATE payment_split_recipients SET recipient_code = :code WHERE id = :id")
                    ->execute([':code' => $splitCode, ':id' => $recipient['id'] ?? 0]);
            }
            
            return $splitCode;
        }

        return null;
    }

    /**
     * Get or create Paystack subaccount for a bank account
     */
    protected function getOrCreateSubaccount(array $bankAccount, string $secretKey): ?string {
        // Check if we already have a subaccount code stored
        if (!empty($bankAccount['gateway_subaccount_code'])) {
            return $bankAccount['gateway_subaccount_code'];
        }

        // `percentage_charge` is what the MASTER account (ALG) keeps when this
        // subaccount is charged directly, with no split attached. Setting it to
        // the school's commission rate means even a mis-configured (split-less)
        // charge cannot hand the platform's fee to the school.
        $orgId = (int) ($bankAccount['org_id'] ?? 0);
        $rate = $orgId > 0 ? $this->effectiveCommissionRate($orgId) : 5.0;

        // Create new subaccount
        $payload = [
            'business_name' => $bankAccount['account_name'],
            'settlement_bank' => $bankAccount['bank_code'],
            'account_number' => $bankAccount['account_number'],
            'percentage_charge' => $rate,
        ];

        $response = $this->curlRequest("https://api.paystack.co/subaccount", 'POST', $payload, [
            "Authorization: Bearer {$secretKey}",
            "Content-Type: application/json"
        ]);

        if (!empty($response['data']['subaccount_code'])) {
            $subaccountCode = $response['data']['subaccount_code'];
            
            // Store in bank account record for reuse
            $this->db->prepare("UPDATE school_bank_accounts SET gateway_subaccount_code = :code WHERE id = :id")
                ->execute([':code' => $subaccountCode, ':id' => $bankAccount['id']]);
            
            return $subaccountCode;
        }

        return null;
    }

    /**
     * Execute Paystack Split.
     *
     * When the transaction was initialised with a Paystack `split_code`
     * (SPL_…), Paystack already settled every party at collection time.
     * Posting /transfer here would pay the school twice, so we only record
     * the accounting outcome. Manual transfers are reserved for legacy splits
     * that never had a gateway split code.
     */
    protected function executePaystackSplit(array $payment, array $split, int $splitTxnId): void {
        $gatewayCode = (string) ($split['gateway_split_id'] ?? '');
        $settledAtSource = strpos($gatewayCode, 'SPL_') === 0;
        $secretKey = \Alg\Payment\GatewayConfig::secret('paystack');

        if ($settledAtSource || $secretKey === '') {
            $this->db->prepare("
                UPDATE payment_split_distributions
                   SET status = 'transferred', transfer_status = :tstatus
                 WHERE split_transaction_id = :id
            ")->execute([':tstatus' => $settledAtSource ? 'settled_by_gateway_split' : 'dev_mode', ':id' => $splitTxnId]);

            $this->db->prepare("
                UPDATE payment_split_transactions
                   SET status = 'executed', split_executed_at = NOW(), gateway_response = :resp
                 WHERE id = :id
            ")->execute([
                ':resp' => json_encode([
                    'mode'       => $settledAtSource ? 'auto_split_at_collection' : 'dev_mode',
                    'split_code' => $gatewayCode ?: null,
                ]),
                ':id' => $splitTxnId,
            ]);
            return;
        }

        $distributions = $this->db->prepare("SELECT * FROM payment_split_distributions WHERE split_transaction_id = :id");
        $distributions->execute([':id' => $splitTxnId]);
        $distributions = $distributions->fetchAll(\PDO::FETCH_ASSOC);

        foreach ($distributions as $dist) {
            $recipient = $this->db->prepare("SELECT * FROM payment_split_recipients WHERE id = :id");
            $recipient->execute([':id' => $dist['recipient_id']]);
            $recipient = $recipient->fetch(\PDO::FETCH_ASSOC);

            if (!empty($recipient['recipient_code'])) {
                $payload = [
                    'source' => 'balance',
                    'reason' => 'Split payment from ' . ($payment['reference'] ?? ''),
                    'amount' => (int)round($dist['amount'] * 100), // In kobo
                    'recipient' => $recipient['recipient_code'],
                    'reference' => 'SPLIT_' . $splitTxnId . '_' . $dist['id']
                ];

                $response = $this->curlRequest("https://api.paystack.co/transfer", 'POST', $payload, [
                    "Authorization: Bearer {$secretKey}",
                    "Content-Type: application/json"
                ]);

                $transferStatus = $response['data']['status'] ?? 'failed';
                $transferRef = $response['data']['reference'] ?? null;

                $this->db->prepare("UPDATE payment_split_distributions SET status = :status, transfer_reference = :ref, transfer_status = :tstatus WHERE id = :id")
                    ->execute([
                        ':status' => $transferStatus === 'success' ? 'transferred' : 'failed',
                        ':ref' => $transferRef,
                        ':tstatus' => $transferStatus,
                        ':id' => $dist['id']
                    ]);
            }
        }

        $this->db->prepare("UPDATE payment_split_transactions SET status = 'executed', split_executed_at = NOW() WHERE id = :id")
            ->execute([':id' => $splitTxnId]);
    }

    protected function createFlutterwaveSubaccount(int $orgId, int $splitId, string $name, array $recipients): ?string {
        // Flutterwave uses subaccounts for splits
        // Implementation similar to Paystack
        return null; // TODO: Implement Flutterwave subaccount creation
    }

    protected function executeFlutterwaveSplit(array $payment, array $split, int $splitTxnId): void {
        // Flutterwave split implementation
        $this->db->prepare("UPDATE payment_split_transactions SET status = 'executed', split_executed_at = NOW() WHERE id = :id")
            ->execute([':id' => $splitTxnId]);
    }

    protected function curlRequest(string $url, string $method, array $data, array $headers): array {
        $body = !empty($data) ? json_encode($data) : null;
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);

        if ($method === 'POST' && $body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        }

        $res = curl_exec($ch);
        curl_close($ch);

        return json_decode($res, true) ?: [];
    }
}
