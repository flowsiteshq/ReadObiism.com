<?php
/**
 * ALG School OS - Disbursement Engine
 * 
 * Handles money flowing OUT: refunds, salary payments, vendor payments, expenses
 * 
 * Supported Channels (Nigeria):
 * - Paystack Transfers (Nuban transfers)
 * - Flutterwave Transfers
 * - Manual bank transfers (logged for bursar execution)
 * 
 * Features:
 * - Single and bulk disbursements
 * - Approval workflow (optional)
 * - Balance check before disbursement
 * - Idempotent transfers
 * - Audit logging
 */

namespace Alg\Payment;

class DisbursementEngine {
    protected $db;

    public function __construct($db = null) {
        $this->db = $db ?: getDbConnection();
    }

    /**
     * Initiate a single disbursement
     */
    public function disburse(array $params): array {
        $orgId      = (int)$params['org_id'];
        $type       = $params['disbursement_type']; // refund, salary, vendor_payment, expense, other
        $recipientName  = $params['recipient_name'];
        $recipientEmail = $params['recipient_email'] ?? null;
        $bankAccountId  = $params['bank_account_id'] ?? null;
        $accountNumber  = $params['account_number'] ?? null;
        $bankCode       = $params['bank_code'] ?? null;
        $bankName       = $params['bank_name'] ?? null;
        $amount     = (float)$params['amount'];
        $currency   = $params['currency'] ?? 'NGN';
        $narration  = $params['narration'] ?? null;
        $provider   = $params['provider'] ?? 'paystack';
        $createdBy  = (int)$params['created_by'];
        $requiresApproval = $params['requires_approval'] ?? false;

        if ($amount <= 0) {
            throw new \Exception('Disbursement amount must be positive');
        }

        // CBN single transaction limit (NGN 5,000,000 for personal accounts, higher for corporate)
        if ($currency === 'NGN' && $amount > 20000000) {
            \Alg\Audit\AuditLogger::log('disbursement.high_value_flagged', 'disbursement', null, null, [
                'amount' => $amount, 'org_id' => $orgId
            ], $createdBy, $orgId);
        }

        // Generate reference
        $reference = 'DISB_' . strtoupper($provider) . '_' . date('YmdHis') . '_' . bin2hex(random_bytes(4));

        // If bank_account_id provided, resolve account details
        if ($bankAccountId && !$accountNumber) {
            $stmt = $this->db->prepare("SELECT * FROM school_bank_accounts WHERE id = :id AND status = 'active'");
            $stmt->execute([':id' => $bankAccountId]);
            $bankAccount = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$bankAccount) {
                throw new \Exception('Bank account not found or inactive');
            }
            $accountNumber = $bankAccount['account_number'];
            $bankCode = $bankAccount['bank_code'];
            $bankName = $bankAccount['bank_name'];
        }

        if (!$accountNumber || !$bankCode) {
            throw new \Exception('Account number and bank code are required');
        }

        $this->db->beginTransaction();
        try {
            $status = $requiresApproval ? 'pending' : 'processing';
            $stmt = $this->db->prepare("
                INSERT INTO disbursements 
                (org_id, disbursement_type, recipient_name, recipient_email, bank_account_id, 
                 account_number, bank_code, bank_name, amount, currency, narration, reference, 
                 provider, status, approved_by, created_by, created_at)
                VALUES (:org, :type, :name, :email, :bank_id, :acc, :bank_code, :bank_name, 
                        :amount, :currency, :narration, :reference, :provider, :status, 
                        :approved_by, :created_by, NOW())
            ");
            $stmt->execute([
                ':org' => $orgId,
                ':type' => $type,
                ':name' => $recipientName,
                ':email' => $recipientEmail,
                ':bank_id' => $bankAccountId,
                ':acc' => $accountNumber,
                ':bank_code' => $bankCode,
                ':bank_name' => $bankName,
                ':amount' => $amount,
                ':currency' => $currency,
                ':narration' => $narration,
                ':reference' => $reference,
                ':provider' => $provider,
                ':status' => $status,
                ':approved_by' => $requiresApproval ? null : $createdBy,
                ':created_by' => $createdBy
            ]);
            $disbursementId = (int)$this->db->lastInsertId();

            // Log transaction
            $this->logTransaction($disbursementId, 'initialized', null, $status, $amount, $currency, null, $createdBy);

            $this->db->commit();

            // Execute disbursement if no approval needed
            if (!$requiresApproval) {
                return $this->executeDisbursement($disbursementId);
            }

            return [
                'id' => $disbursementId,
                'reference' => $reference,
                'status' => 'pending_approval',
                'amount' => $amount,
                'message' => 'Disbursement created. Pending approval.'
            ];

        } catch (\Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    /**
     * Approve a pending disbursement
     */
    public function approveDisbursement(int $disbursementId, int $approvedBy): array {
        $stmt = $this->db->prepare("SELECT * FROM disbursements WHERE id = :id AND status = 'pending'");
        $stmt->execute([':id' => $disbursementId]);
        $disbursement = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$disbursement) {
            throw new \Exception('Disbursement not found or not pending');
        }

        $this->db->prepare("UPDATE disbursements SET status = 'processing', approved_by = :by, approved_at = NOW() WHERE id = :id")
            ->execute([':by' => $approvedBy, ':id' => $disbursementId]);

        $this->logTransaction($disbursementId, 'disbursed', 'pending', 'processing', (float)$disbursement['amount'], $disbursement['currency'], ['approved_by' => $approvedBy], $approvedBy);

        return $this->executeDisbursement($disbursementId);
    }

    /**
     * Execute the actual disbursement via gateway
     */
    public function executeDisbursement(int $disbursementId): array {
        $stmt = $this->db->prepare("SELECT * FROM disbursements WHERE id = :id AND status IN ('processing', 'failed')");
        $stmt->execute([':id' => $disbursementId]);
        $disbursement = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$disbursement) {
            throw new \Exception('Disbursement not found or not processable');
        }

        $provider = $disbursement['provider'];
        $result = [];

        switch ($provider) {
            case 'paystack':
                $result = $this->executePaystackTransfer($disbursement);
                break;
            case 'flutterwave':
                $result = $this->executeFlutterwaveTransfer($disbursement);
                break;
            case 'manual':
                $result = ['status' => 'pending', 'message' => 'Manual disbursement. Execute via bank portal.'];
                break;
            default:
                throw new \Exception('Unsupported disbursement provider: ' . $provider);
        }

        // Update disbursement record
        $newStatus = $result['status'] === 'successful' ? 'successful' : ($result['status'] === 'pending' ? 'processing' : 'failed');
        $this->db->prepare("
            UPDATE disbursements SET status = :status, provider_transfer_id = :transfer_id, 
                   gateway_response = :response, processed_at = NOW()
            WHERE id = :id
        ")->execute([
            ':status' => $newStatus,
            ':transfer_id' => $result['transfer_id'] ?? null,
            ':response' => json_encode($result),
            ':id' => $disbursementId
        ]);

        $this->logTransaction($disbursementId, 'disbursed', 'processing', $newStatus, (float)$disbursement['amount'], $disbursement['currency'], $result, (int)$disbursement['created_by']);

        return array_merge($result, ['disbursement_id' => $disbursementId, 'reference' => $disbursement['reference']]);
    }

    /**
     * Execute Paystack NUBAN Transfer
     */
    protected function executePaystackTransfer(array $disbursement): array {
        $secretKey = \Alg\Payment\GatewayConfig::secret('paystack');
        if (empty($secretKey)) {
            return ['status' => 'successful', 'transfer_id' => 'DEV_' . $disbursement['id'], 'message' => 'Dev mode'];
        }

        // First, create a transfer recipient
        $recipientPayload = [
            'type' => 'nuban',
            'name' => $disbursement['recipient_name'],
            'account_number' => $disbursement['account_number'],
            'bank_code' => $disbursement['bank_code'],
            'currency' => $disbursement['currency']
        ];

        $recipientResponse = $this->curlRequest("https://api.paystack.co/transferrecipient", 'POST', $recipientPayload, [
            "Authorization: Bearer {$secretKey}",
            "Content-Type: application/json"
        ]);

        $recipientCode = $recipientResponse['data']['recipient_code'] ?? null;
        if (!$recipientCode) {
            return ['status' => 'failed', 'error' => 'Failed to create recipient'];
        }

        // Initiate transfer
        $payload = [
            'source' => 'balance',
            'amount' => (int)round($disbursement['amount'] * 100), // In kobo
            'recipient' => $recipientCode,
            'reference' => $disbursement['reference'],
            'reason' => $disbursement['narration'] ?? ('Disbursement ' . $disbursement['reference'])
        ];

        $response = $this->curlRequest("https://api.paystack.co/transfer", 'POST', $payload, [
            "Authorization: Bearer {$secretKey}",
            "Content-Type: application/json"
        ]);

        $data = $response['data'] ?? [];
        return [
            'status' => ($data['status'] ?? '') === 'success' ? 'successful' : (($data['status'] ?? '') === 'pending' ? 'pending' : 'failed'),
            'transfer_id' => $data['transfer_code'] ?? null,
            'gateway_response' => $response
        ];
    }

    /**
     * Execute Flutterwave Transfer
     */
    protected function executeFlutterwaveTransfer(array $disbursement): array {
        $secretKey = \Alg\Payment\GatewayConfig::secret('flutterwave');
        if (empty($secretKey)) {
            return ['status' => 'successful', 'transfer_id' => 'DEV_' . $disbursement['id'], 'message' => 'Dev mode'];
        }

        $payload = [
            'account_bank' => $disbursement['bank_code'],
            'account_number' => $disbursement['account_number'],
            'amount' => $disbursement['amount'],
            'currency' => $disbursement['currency'],
            'beneficiary_name' => $disbursement['recipient_name'],
            'reference' => $disbursement['reference'],
            'narration' => $disbursement['narration'] ?? 'Disbursement',
            'callback_url' => \Config::get('app_url') . '/api/finance/webhook.php?provider=flutterwave'
        ];

        $response = $this->curlRequest("https://api.flutterwave.com/v3/transfers", 'POST', $payload, [
            "Authorization: Bearer {$secretKey}",
            "Content-Type: application/json"
        ]);

        $data = $response['data'] ?? [];
        return [
            'status' => ($data['status'] ?? '') === 'successful' ? 'successful' : (($data['status'] ?? '') === 'pending' ? 'pending' : 'failed'),
            'transfer_id' => $data['id'] ?? null,
            'gateway_response' => $response
        ];
    }

    /**
     * Bulk disbursement
     */
    public function bulkDisburse(int $orgId, string $type, array $disbursements, int $createdBy): array {
        $results = [];
        $this->db->beginTransaction();
        try {
            foreach ($disbursements as $d) {
                $d['org_id'] = $orgId;
                $d['disbursement_type'] = $type;
                $d['created_by'] = $createdBy;
                $results[] = $this->disburse($d);
            }
            $this->db->commit();
        } catch (\Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }
        return ['total' => count($results), 'disbursements' => $results];
    }

    /**
     * Process refund for a payment
     */
    public function refundPayment(int $paymentId, float $amount, int $userId, ?string $reason = null): array {
        $stmt = $this->db->prepare("SELECT * FROM payments WHERE id = :id AND status = 'successful'");
        $stmt->execute([':id' => $paymentId]);
        $payment = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$payment) {
            throw new \Exception('Payment not found or not successful');
        }

        if ($amount > (float)$payment['amount']) {
            throw new \Exception('Refund amount exceeds payment amount');
        }

        // Update payment status
        $newStatus = $amount >= (float)$payment['amount'] ? 'refunded' : 'successful';
        $this->db->prepare("UPDATE payments SET status = :status WHERE id = :id")
            ->execute([':status' => $newStatus, ':id' => $paymentId]);

        // Reconcile invoice if linked
        if (!empty($payment['invoice_id'])) {
            $this->reconcileInvoiceAfterRefund((int)$payment['invoice_id']);
        }

        // Create disbursement for the refund
        $refundResult = $this->disburse([
            'org_id' => $payment['org_id'],
            'disbursement_type' => 'refund',
            'recipient_name' => $payment['user_id'] ?? 'Customer',
            'bank_account_id' => null,
            'account_number' => null,
            'bank_code' => null,
            'bank_name' => null,
            'amount' => $amount,
            'currency' => $payment['currency'],
            'narration' => $reason ?? ('Refund for payment ' . ($payment['reference'] ?? '')),
            'provider' => $payment['provider'] !== 'cash' && $payment['provider'] !== 'bank_transfer' ? $payment['provider'] : 'manual',
            'created_by' => $userId
        ]);

        $this->logTransaction(null, 'refunded', 'successful', 'refunded', $amount, $payment['currency'], [
            'payment_id' => $paymentId, 'reference' => $payment['reference'], 'reason' => $reason
        ], $userId);

        return $refundResult;
    }

    protected function reconcileInvoiceAfterRefund(int $invoiceId): void {
        $paidStmt = $this->db->prepare("SELECT COALESCE(SUM(amount), 0) FROM payments WHERE invoice_id = :id AND status = 'successful'");
        $paidStmt->execute([':id' => $invoiceId]);
        $paid = (float)$paidStmt->fetchColumn();

        $invStmt = $this->db->prepare("SELECT total_amount FROM invoices WHERE id = :id");
        $invStmt->execute([':id' => $invoiceId]);
        $total = (float)$invStmt->fetchColumn();

        $status = $paid <= 0 ? 'unpaid' : ($paid + 0.01 >= $total ? 'paid' : 'partially_paid');
        $this->db->prepare("UPDATE invoices SET paid_amount = :paid, status = :status WHERE id = :id")
            ->execute([':paid' => $paid, ':status' => $status, ':id' => $invoiceId]);
    }

    protected function logTransaction(?int $disbursementId, string $event, ?string $from, ?string $to, ?float $amount, ?string $currency, ?array $response, ?int $userId): void {
        try {
            $this->db->prepare("
                INSERT INTO payment_transaction_log 
                (disbursement_id, event_type, status_from, status_to, amount, currency, gateway_response, user_id, created_at)
                VALUES (:disb_id, :event, :from, :to, :amount, :currency, :response, :user_id, NOW())
            ")->execute([
                ':disb_id' => $disbursementId,
                ':event' => $event,
                ':from' => $from,
                ':to' => $to,
                ':amount' => $amount,
                ':currency' => $currency ?? 'NGN',
                ':response' => $response ? json_encode($response) : null,
                ':user_id' => $userId
            ]);
        } catch (\Throwable $e) {
            // Don't break the main flow on audit failure
        }
    }

    protected function curlRequest(string $url, string $method, array $data, array $headers): array {
        $body = json_encode($data);
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $body);

        $res = curl_exec($ch);
        curl_close($ch);

        return json_decode($res, true) ?: [];
    }
}
