<?php
/**
 * ALG Company - Multi-Gateway Payment Engine
 * 
 * Unified payment provider abstraction supporting:
 * - Paystack (NGN, GHS, ZAR, USD)
 * - Flutterwave (NGN, USD, KES, GHS, EUR, GBP)
 * - Stripe (Global Cards, Apple Pay, Google Pay)
 * - PayPal (Global Orders v2 API)
 * - OPay (Cashier v3 API)
 * 
 * Features:
 * - Single initialize() and verify() facade
 * - Automatic transaction logging to database
 * - Webhook signature verification for each gateway
 * - Graceful fallback / developer test simulator mode
 */

namespace Alg\Payment;

class PaymentManager {
    protected $db;

    public function __construct($db = null) {
        $this->db = $db ?: getDbConnection();
    }

    /**
     * Initialize Checkout across any supported provider
     */
    public function initialize(string $provider, float $amount, string $currency, string $email, string $reference = null, string $callbackUrl = null, array $metadata = [], int $userId = 1, int $orgId = 1, ?int $invoiceId = null, ?int $splitId = null): array {
        $provider = strtolower(trim($provider));
        $reference = $reference ?: "ALG_" . strtoupper($provider) . "_" . time() . "_" . bin2hex(random_bytes(4));
        $callbackUrl = $callbackUrl ?: \Config::get('app_url', 'http://localhost') . "/alg-company-frontend-boilerplate/dashboard/payments.html";

        // Auto-detect split if not provided but invoice exists
        if (!$splitId && $invoiceId) {
            $splitId = $this->findSplitForInvoice($invoiceId, $orgId);
        }

        // Get split code from database if splitId provided
        $splitCode = null;
        if ($splitId) {
            $stmt = $this->db->prepare("SELECT gateway_split_id FROM payment_splits WHERE id = :id AND is_active = 1");
            $stmt->execute([':id' => $splitId]);
            $splitCode = $stmt->fetchColumn() ?: null;
        }

        // SPL_AUTO_* codes are local development placeholders, not Paystack
        // split codes. Sending one to a live Paystack account makes checkout
        // initialization fail with a 4xx response.
        if ($provider === 'paystack'
            && \Alg\Payment\GatewayConfig::mode('paystack') === 'live'
            && is_string($splitCode)
            && strpos($splitCode, 'SPL_AUTO_') === 0) {
            \Alg\Audit\AuditLogger::log('payment.simulated_split_skipped', 'payment', null, (int) $userId, [
                'org_id' => $orgId,
                'split_id' => $splitId,
            ], (int) $userId, (int) $orgId);
            $splitCode = null;
            $splitId = null;
        }

        // Seamless PaySplit: if the school has no split yet, provision one from
        // its settlement account so this payment is split automatically. This
        // is what lets a school receive money after only adding a bank account.
        if (!$splitCode && $provider === 'paystack' && $orgId > 0 && \Alg\Payment\GatewayConfig::secret('paystack') !== '') {
            try {
                $splitEngine = new \Alg\Payment\PaySplitEngine($this->db);
                $ensured = $splitEngine->ensureSchoolSplit((int) $orgId, (int) $userId);
                if ($ensured) {
                    $splitId = (int) $ensured['id'];
                    $splitCode = $ensured['gateway_split_id'] ?: null;
                }
            } catch (\Throwable $splitError) {
                \Alg\Audit\AuditLogger::log('payment.split_auto_provision_failed', 'payment', null, (int) $userId, [
                    'org_id' => $orgId,
                    'error'  => $splitError->getMessage(),
                ], (int) $userId, (int) $orgId);
            }
        }

        switch ($provider) {
            case 'paystack':
                $result = $this->initializePaystack($amount, $currency, $email, $reference, $callbackUrl, $metadata, $splitCode);
                break;
            case 'flutterwave':
                $result = $this->initializeFlutterwave($amount, $currency, $email, $reference, $callbackUrl, $metadata);
                break;
            case 'stripe':
                $result = $this->initializeStripe($amount, $currency, $email, $reference, $callbackUrl, $metadata);
                break;
            case 'paypal':
                $result = $this->initializePayPal($amount, $currency, $email, $reference, $callbackUrl, $metadata);
                break;
            case 'opay':
                $result = $this->initializeOPay($amount, $currency, $email, $reference, $callbackUrl, $metadata);
                break;
            default:
                throw new \Exception("Unsupported payment provider: {$provider}. Supported: paystack, flutterwave, stripe, paypal, opay.");
        }

        // Record pending payment in database
        $this->recordPayment($orgId, $userId, $reference, $provider, $amount, $currency, 'pending', $invoiceId, $splitId);

        return array_merge($result, [
            'provider'  => $provider,
            'reference' => $reference,
            'amount'    => $amount,
            'currency'  => strtoupper($currency),
            'split_id'  => $splitId,
            'split_code' => $splitCode
        ]);
    }

    /**
     * Verify payment status across any supported provider with anti-tampering checks
     */
    public function verify(string $provider, string $reference): array {
        $provider = strtolower(trim($provider));

        // 1. Fetch expected transaction from DB to verify idempotency & amount
        $expected = null;
        if ($this->db) {
            $stmt = $this->db->prepare("SELECT * FROM payments WHERE reference = :ref LIMIT 1");
            $stmt->execute([':ref' => $reference]);
            $expected = $stmt->fetch();
        }

        // Idempotency: If already confirmed as successful, prevent double-processing
        if ($expected && $expected['status'] === 'successful') {
            // Repair/complete settlement in case it succeeded before reconciliation
            // was introduced (safe to run repeatedly — both steps are idempotent).
            $this->settlePayment($expected);
            return [
                'status'     => 'successful',
                'amount'     => (float)$expected['amount'],
                'currency'   => $expected['currency'],
                'reference'  => $reference,
                'idempotent' => true,
                'message'    => 'Payment was already confirmed and credited.'
            ];
        }

        // 2. Gateway Verification Dispatch
        switch ($provider) {
            case 'paystack':
                $result = $this->verifyPaystack($reference);
                break;
            case 'flutterwave':
                $result = $this->verifyFlutterwave($reference);
                break;
            case 'stripe':
                $result = $this->verifyStripe($reference);
                break;
            case 'paypal':
                $result = $this->verifyPayPal($reference);
                break;
            case 'opay':
                $result = $this->verifyOPay($reference);
                break;
            default:
                throw new \Exception("Unsupported payment provider: {$provider}");
        }

        // 3. Anti-Fraud & Amount Tampering Cross-Check
        if (($result['status'] ?? '') === 'successful' && $expected) {
            $expectedAmount = (float)$expected['amount'];
            $actualPaidAmount = (float)($result['amount'] ?? $expectedAmount);
            $expectedCurrency = strtoupper($expected['currency']);
            $actualPaidCurrency = strtoupper($result['currency'] ?? $expectedCurrency);

            // If actual amount is less than expected amount: flag fraud!
            if ($actualPaidAmount < ($expectedAmount - 0.01)) {
                $this->updatePaymentStatus($reference, 'failed');
                \Alg\Audit\AuditLogger::log('payment.fraud_tampering_detected', 'payment', (int)$expected['id'], null, [
                    'expected_amount' => $expectedAmount,
                    'paid_amount'     => $actualPaidAmount,
                    'reference'       => $reference
                ]);
                throw new \Exception("Payment Security Violation: Paid amount ({$actualPaidAmount} {$actualPaidCurrency}) does not match invoice amount ({$expectedAmount} {$expectedCurrency}).");
            }

            if (!empty($result['currency']) && $actualPaidCurrency !== $expectedCurrency) {
                $this->updatePaymentStatus($reference, 'failed');
                throw new \Exception("Payment Security Violation: Currency mismatch. Expected {$expectedCurrency}, received {$actualPaidCurrency}.");
            }

            $this->updatePaymentStatus($reference, 'successful');

            // Reconcile the invoice balance/status and post the double-entry.
            $this->settlePayment($expected);
        }

        return $result;
    }

    // ==========================================
    // 1. PAYSTACK IMPLEMENTATION
    // ==========================================
    protected function initializePaystack(float $amount, string $currency, string $email, string $reference, string $callbackUrl, array $metadata, ?string $splitCode = null): array {
        $secretKey = \Alg\Payment\GatewayConfig::secret('paystack');
        if (empty($secretKey)) {
            // Dev Mock
            return [
                'checkout_url' => "https://checkout.paystack.com/demo_" . bin2hex(random_bytes(8)),
                'access_code'  => "demo_code_" . rand(100000, 999999)
            ];
        }

        $payload = [
            'email'        => $email,
            'amount'       => (int)round($amount * 100), // In kobo/cents
            'currency'     => strtoupper($currency),
            'reference'    => $reference,
            'callback_url' => $callbackUrl,
            'metadata'     => $metadata
        ];

        // Add split code if available (enables automatic split payments)
        if ($splitCode) {
            $payload['split_code'] = $splitCode;
        }

        $response = $this->curlRequest("https://api.paystack.co/transaction/initialize", 'POST', $payload, [
            "Authorization: Bearer {$secretKey}",
            "Content-Type: application/json"
        ]);

        if (!empty($response['data']['authorization_url'])) {
            return [
                'checkout_url' => $response['data']['authorization_url'],
                'access_code'  => $response['data']['access_code']
            ];
        }

        throw new \Exception($response['message'] ?? "Failed to initialize Paystack checkout.");
    }

    protected function verifyPaystack(string $reference): array {
        $secretKey = \Alg\Payment\GatewayConfig::secret('paystack');
        if (empty($secretKey)) {
            return ['status' => 'successful', 'gateway_response' => 'Successful (Dev Mode)', 'reference' => $reference];
        }

        $response = $this->curlRequest("https://api.paystack.co/transaction/verify/" . rawurlencode($reference), 'GET', [], [
            "Authorization: Bearer {$secretKey}"
        ]);

        $data = $response['data'] ?? [];
        $isSuccess = ($data['status'] ?? '') === 'success';

        return [
            'status'           => $isSuccess ? 'successful' : 'failed',
            'amount'           => ($data['amount'] ?? 0) / 100,
            'currency'         => $data['currency'] ?? 'NGN',
            'paid_at'          => $data['paid_at'] ?? null,
            'channel'          => $data['channel'] ?? 'card',
            'gateway_response' => $data['gateway_response'] ?? 'Pending'
        ];
    }

    // ==========================================
    // 2. FLUTTERWAVE IMPLEMENTATION
    // ==========================================
    protected function initializeFlutterwave(float $amount, string $currency, string $email, string $reference, string $callbackUrl, array $metadata): array {
        $secretKey = \Alg\Payment\GatewayConfig::secret('flutterwave');
        if (empty($secretKey)) {
            return [
                'checkout_url' => "https://checkout.flutterwave.com/pay/demo_" . bin2hex(random_bytes(8))
            ];
        }

        $payload = [
            'tx_ref'          => $reference,
            'amount'          => $amount,
            'currency'        => strtoupper($currency),
            'redirect_url'    => $callbackUrl,
            'customer'        => [
                'email' => $email
            ],
            'customizations'  => [
                'title' => \Config::get('app_name', 'ALG Studio'),
                'logo'  => \Config::get('app_url') . '/assets/img/logo.png'
            ],
            'meta'            => $metadata
        ];

        $response = $this->curlRequest("https://api.flutterwave.com/v3/payments", 'POST', $payload, [
            "Authorization: Bearer {$secretKey}",
            "Content-Type: application/json"
        ]);

        if (!empty($response['data']['link'])) {
            return [
                'checkout_url' => $response['data']['link']
            ];
        }

        throw new \Exception($response['message'] ?? "Failed to initialize Flutterwave payment.");
    }

    protected function verifyFlutterwave(string $reference): array {
        $secretKey = \Alg\Payment\GatewayConfig::secret('flutterwave');
        if (empty($secretKey)) {
            return ['status' => 'successful', 'gateway_response' => 'Successful (Dev Mode)', 'reference' => $reference];
        }

        $url = "https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=" . rawurlencode($reference);
        $response = $this->curlRequest($url, 'GET', [], [
            "Authorization: Bearer {$secretKey}"
        ]);

        $data = $response['data'] ?? [];
        $isSuccess = ($data['status'] ?? '') === 'successful';

        return [
            'status'           => $isSuccess ? 'successful' : 'failed',
            'amount'           => $data['amount'] ?? 0,
            'currency'         => $data['currency'] ?? 'NGN',
            'flw_ref'          => $data['flw_ref'] ?? null,
            'gateway_response' => $data['processor_response'] ?? 'Pending'
        ];
    }

    // ==========================================
    // 3. STRIPE IMPLEMENTATION
    // ==========================================
    protected function initializeStripe(float $amount, string $currency, string $email, string $reference, string $callbackUrl, array $metadata): array {
        $secretKey = \Alg\Payment\GatewayConfig::secret('stripe');
        if (empty($secretKey)) {
            return [
                'checkout_url' => "https://checkout.stripe.com/pay/cs_test_" . bin2hex(random_bytes(12))
            ];
        }

        $postData = http_build_query([
            'payment_method_types' => ['card'],
            'mode'                 => 'payment',
            'customer_email'       => $email,
            'client_reference_id'  => $reference,
            'success_url'          => $callbackUrl . "?status=success&session_id={CHECKOUT_SESSION_ID}",
            'cancel_url'           => $callbackUrl . "?status=cancelled",
            'line_items'           => [
                [
                    'price_data' => [
                        'currency'     => strtolower($currency),
                        'unit_amount' => (int)round($amount * 100),
                        'product_data' => [
                            'name' => \Config::get('app_name', 'ALG Studio') . ' Order'
                        ]
                    ],
                    'quantity' => 1
                ]
            ]
        ]);

        $response = $this->curlRequestRaw("https://api.stripe.com/v1/checkout/sessions", 'POST', $postData, [
            "Authorization: Bearer {$secretKey}",
            "Content-Type: application/x-www-form-urlencoded"
        ]);

        if (!empty($response['url'])) {
            return [
                'checkout_url' => $response['url'],
                'session_id'   => $response['id']
            ];
        }

        throw new \Exception($response['error']['message'] ?? "Failed to initialize Stripe checkout.");
    }

    protected function verifyStripe(string $referenceOrSessionId): array {
        $secretKey = \Alg\Payment\GatewayConfig::secret('stripe');
        if (empty($secretKey)) {
            return ['status' => 'successful', 'gateway_response' => 'Paid (Dev Mode)', 'reference' => $referenceOrSessionId];
        }

        $url = "https://api.stripe.com/v1/checkout/sessions/" . rawurlencode($referenceOrSessionId);
        $response = $this->curlRequestRaw($url, 'GET', '', [
            "Authorization: Bearer {$secretKey}"
        ]);

        $isSuccess = ($response['payment_status'] ?? '') === 'paid';

        return [
            'status'           => $isSuccess ? 'successful' : 'failed',
            'amount'           => ($response['amount_total'] ?? 0) / 100,
            'currency'         => strtoupper($response['currency'] ?? 'USD'),
            'gateway_response' => $response['payment_status'] ?? 'unpaid'
        ];
    }

    // ==========================================
    // 4. PAYPAL IMPLEMENTATION
    // ==========================================
    protected function getPayPalToken(): ?string {
        $clientId = \Alg\Payment\GatewayConfig::publicKey('paypal');
        $clientSecret = \Alg\Payment\GatewayConfig::secret('paypal');
        if (empty($clientId) || empty($clientSecret)) return null;

        $baseUrl = (\Alg\Payment\GatewayConfig::mode('paypal') === 'live') ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
        $res = $this->curlRequestRaw("{$baseUrl}/v1/oauth2/token", 'POST', 'grant_type=client_credentials', [
            "Authorization: Basic " . base64_encode("{$clientId}:{$clientSecret}"),
            "Content-Type: application/x-www-form-urlencoded"
        ]);

        return $res['access_token'] ?? null;
    }

    protected function initializePayPal(float $amount, string $currency, string $email, string $reference, string $callbackUrl, array $metadata): array {
        $token = $this->getPayPalToken();
        if (!$token) {
            return [
                'checkout_url' => "https://www.sandbox.paypal.com/checkoutnow?token=EC-DEMO" . rand(1000, 9999)
            ];
        }

        $baseUrl = (\Alg\Payment\GatewayConfig::mode('paypal') === 'live') ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
        $payload = [
            'intent' => 'CAPTURE',
            'purchase_units' => [
                [
                    'reference_id' => $reference,
                    'amount' => [
                        'currency_code' => strtoupper($currency),
                        'value' => number_format($amount, 2, '.', '')
                    ]
                ]
            ],
            'application_context' => [
                'return_url' => $callbackUrl . "?status=success",
                'cancel_url' => $callbackUrl . "?status=cancelled"
            ]
        ];

        $res = $this->curlRequest("{$baseUrl}/v2/checkout/orders", 'POST', $payload, [
            "Authorization: Bearer {$token}",
            "Content-Type: application/json"
        ]);

        if (!empty($res['links'])) {
            foreach ($res['links'] as $link) {
                if ($link['rel'] === 'approve') {
                    return [
                        'checkout_url' => $link['href'],
                        'order_id'     => $res['id']
                    ];
                }
            }
        }

        throw new \Exception("Failed to generate PayPal checkout order.");
    }

    protected function verifyPayPal(string $orderId): array {
        $token = $this->getPayPalToken();
        if (!$token) {
            return ['status' => 'successful', 'gateway_response' => 'COMPLETED (Dev Mode)', 'reference' => $orderId];
        }

        $baseUrl = (\Alg\Payment\GatewayConfig::mode('paypal') === 'live') ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
        // Capture order
        $res = $this->curlRequest("{$baseUrl}/v2/checkout/orders/{$orderId}/capture", 'POST', [], [
            "Authorization: Bearer {$token}",
            "Content-Type: application/json"
        ]);

        $status = $res['status'] ?? '';
        $isSuccess = ($status === 'COMPLETED');

        return [
            'status'           => $isSuccess ? 'successful' : 'failed',
            'gateway_response' => $status
        ];
    }

    // ==========================================
    // 5. OPAY IMPLEMENTATION
    // ==========================================
    protected function initializeOPay(float $amount, string $currency, string $email, string $reference, string $callbackUrl, array $metadata): array {
        $merchantId = \Alg\Payment\GatewayConfig::extra('opay', 'merchant_id');
        $publicKey = \Alg\Payment\GatewayConfig::publicKey('opay');

        if (empty($merchantId) || empty($publicKey)) {
            return [
                'checkout_url' => "https://cashier.opayweb.com/demo_" . bin2hex(random_bytes(8))
            ];
        }

        $payload = [
            'country'      => 'NG',
            'reference'    => $reference,
            'amount'       => (string)round($amount * 100),
            'currency'     => strtoupper($currency),
            'returnUrl'    => $callbackUrl,
            'callbackUrl'  => \Config::get('app_url') . '/api/payments/webhook.php?provider=opay',
            'userEmail'    => $email,
            'userInfo'     => [
                'userEmail' => $email,
                'userId'    => $metadata['user_id'] ?? '1'
            ],
            'productDesc'  => \Config::get('app_name', 'ALG Studio') . ' Payment'
        ];

        $res = $this->curlRequest("https://cashierapi.opayweb.com/api/v3/cashier/initialize", 'POST', $payload, [
            "Authorization: Bearer {$publicKey}",
            "MerchantId: {$merchantId}",
            "Content-Type: application/json"
        ]);

        if (!empty($res['data']['cashierUrl'])) {
            return [
                'checkout_url' => $res['data']['cashierUrl'],
                'order_no'     => $res['data']['orderNo'] ?? ''
            ];
        }

        throw new \Exception($res['message'] ?? "Failed to initialize OPay checkout.");
    }

    protected function verifyOPay(string $reference): array {
        $merchantId = \Alg\Payment\GatewayConfig::extra('opay', 'merchant_id');
        $publicKey = \Alg\Payment\GatewayConfig::publicKey('opay');

        if (empty($merchantId) || empty($publicKey)) {
            return ['status' => 'successful', 'gateway_response' => 'SUCCESS (Dev Mode)', 'reference' => $reference];
        }

        $payload = [
            'reference'  => $reference,
            'country'    => 'NG'
        ];

        $res = $this->curlRequest("https://cashierapi.opayweb.com/api/v3/cashier/status", 'POST', $payload, [
            "Authorization: Bearer {$publicKey}",
            "MerchantId: {$merchantId}",
            "Content-Type: application/json"
        ]);

        $status = $res['data']['status'] ?? '';
        $isSuccess = ($status === 'SUCCESS');

        return [
            'status'           => $isSuccess ? 'successful' : 'failed',
            'amount'           => ($res['data']['amount'] ?? 0) / 100,
            'currency'         => $res['data']['currency'] ?? 'NGN',
            'gateway_response' => $status
        ];
    }

    // ==========================================
    // DATABASE HELPERS
    // ==========================================
    protected function recordPayment(int $orgId, int $userId, string $reference, string $provider, float $amount, string $currency, string $status, ?int $invoiceId = null, ?int $splitId = null): void {
        if (!$this->db) return;
        try {
            $stmt = $this->db->prepare("
                INSERT INTO payments (org_id, user_id, reference, provider, amount, currency, status, invoice_id, split_id, created_at)
                VALUES (:org_id, :user_id, :reference, :provider, :amount, :currency, :status, :invoice_id, :split_id, NOW())
            ");
            $stmt->execute([
                ':org_id'     => $orgId,
                ':user_id'    => $userId,
                ':reference'  => $reference,
                ':provider'   => $provider,
                ':amount'     => $amount,
                ':currency'   => $currency,
                ':status'     => $status,
                ':invoice_id' => $invoiceId ?: null,
                ':split_id'   => $splitId ?: null
            ]);
        } catch (\PDOException $e) {}
    }

    public function updatePaymentStatus(string $reference, string $status): void {
        if (!$this->db) return;
        try {
            $stmt = $this->db->prepare("UPDATE payments SET status = :status WHERE reference = :reference");
            $stmt->execute([':status' => $status, ':reference' => $reference]);
        } catch (\PDOException $e) {}
    }

    /**
     * Find applicable split for an invoice
     */
    public function findSplitForInvoice(int $invoiceId, int $orgId): ?int {
        if (!$this->db) return null;

        // Get invoice details
        $stmt = $this->db->prepare("SELECT * FROM invoices WHERE id = :id LIMIT 1");
        $stmt->execute([':id' => $invoiceId]);
        $invoice = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$invoice) return null;

        // Check for invoice-specific split
        $stmt = $this->db->prepare("
            SELECT ps.id FROM payment_splits ps
            JOIN payment_split_assignments psa ON psa.split_id = ps.id
            WHERE psa.assignment_type = 'invoice' AND psa.assignment_id = :invoice_id
            AND ps.org_id = :org_id AND ps.is_active = 1
            ORDER BY psa.priority DESC
            LIMIT 1
        ");
        $stmt->execute([':invoice_id' => $invoiceId, ':org_id' => $orgId]);
        $splitId = $stmt->fetchColumn();
        if ($splitId) return (int)$splitId;

        // Check for fee_category-specific split
        if (!empty($invoice['fee_category_id'])) {
            $stmt = $this->db->prepare("
                SELECT ps.id FROM payment_splits ps
                JOIN payment_split_assignments psa ON psa.split_id = ps.id
                WHERE psa.assignment_type = 'fee_category' AND psa.assignment_id = :category_id
                AND ps.org_id = :org_id AND ps.is_active = 1
                ORDER BY psa.priority DESC
                LIMIT 1
            ");
            $stmt->execute([':category_id' => $invoice['fee_category_id'], ':org_id' => $orgId]);
            $splitId = $stmt->fetchColumn();
            if ($splitId) return (int)$splitId;
        }

        // Fall back to global split for the org
        $stmt = $this->db->prepare("
            SELECT ps.id FROM payment_splits ps
            JOIN payment_split_assignments psa ON psa.split_id = ps.id
            WHERE psa.assignment_type = 'global' AND ps.org_id = :org_id
            AND ps.is_active = 1
            ORDER BY psa.priority DESC
            LIMIT 1
        ");
        $stmt->execute([':org_id' => $orgId]);
        // fetchColumn() advances the result set. Reading it twice discarded
        // every global split and left otherwise valid payments unsplit.
        $splitId = $stmt->fetchColumn();
        return $splitId ? (int)$splitId : null;
    }

    /**
     * Settle a successful payment: reconcile its invoice and post the ledger
     * entry. Both steps are idempotent so this is safe to call on re-verification.
     */
    public function settlePayment(array $payment): void {
        if (!$this->db || empty($payment)) return;

        // 1. Roll confirmed payments up into the linked invoice.
        if (!empty($payment['invoice_id'])) {
            try {
                $this->reconcileInvoice((int)$payment['invoice_id']);
            } catch (\Throwable $e) {
                \Alg\Audit\AuditLogger::log('payment.reconcile_failed', 'payment', (int)($payment['id'] ?? 0), null, [
                    'invoice_id' => (int)$payment['invoice_id'],
                    'error'      => $e->getMessage()
                ], (int)($payment['user_id'] ?? 0), (int)($payment['org_id'] ?? 1));
            }
        }

        // 2. Post Debit Cash / Credit Accounts Receivable once.
        if (empty($payment['gl_posted'])) {
            try {
                \Alg\Finance\GeneralLedger::postPaymentReceived(
                    $this->db,
                    (int)$payment['org_id'],
                    (int)$payment['id'],
                    (float)$payment['amount'],
                    (int)($payment['user_id'] ?? 0),
                    (string)($payment['reference'] ?? ''),
                    !empty($payment['invoice_id'])
                );
                $this->db->prepare("UPDATE payments SET gl_posted = 1, gl_posted_at = NOW() WHERE id = :id")
                    ->execute([':id' => (int)$payment['id']]);
            } catch (\Throwable $e) {
                \Alg\Audit\AuditLogger::log('payment.gl_post_failed', 'payment', (int)($payment['id'] ?? 0), null, [
                    'error' => $e->getMessage()
                ], (int)($payment['user_id'] ?? 0), (int)($payment['org_id'] ?? 1));
            }
        }

        // 3. Post split execution if payment has split_id and not executed yet
        if (!empty($payment['split_id']) && empty($payment['split_executed'])) {
            try {
                $splitEngine = new \Alg\Payment\PaySplitEngine($this->db);
                $splitEngine->executeSplit((int)$payment['id'], (float)$payment['amount']);
            } catch (\Throwable $e) {
                \Alg\Audit\AuditLogger::log('payment.split_execution_failed', 'payment', (int)($payment['id'] ?? 0), null, [
                    'split_id' => $payment['split_id'],
                    'error'    => $e->getMessage()
                ], (int)($payment['user_id'] ?? 0), (int)($payment['org_id'] ?? 1));
            }
        }
    }

    /**
     * Recompute an invoice's paid_amount and status from its successful payments.
     */
    public function reconcileInvoice(int $invoiceId): void {
        if (!$this->db || $invoiceId <= 0) return;

        $stmt = $this->db->prepare("SELECT id, total_amount, due_date FROM invoices WHERE id = :id LIMIT 1");
        $stmt->execute([':id' => $invoiceId]);
        $invoice = $stmt->fetch();
        if (!$invoice) return;

        $paidStmt = $this->db->prepare("SELECT COALESCE(SUM(amount), 0) FROM payments WHERE invoice_id = :id AND status = 'successful'");
        $paidStmt->execute([':id' => $invoiceId]);
        $paid = (float)$paidStmt->fetchColumn();

        $total = (float)$invoice['total_amount'];
        if ($paid <= 0.001) {
            $status = 'unpaid';
        } elseif ($paid + 0.01 >= $total) {
            $status = 'paid';
        } else {
            $status = 'partially_paid';
        }
        if ($status !== 'paid' && !empty($invoice['due_date']) && $invoice['due_date'] < date('Y-m-d')) {
            $status = 'overdue';
        }

        $this->db->prepare("UPDATE invoices SET paid_amount = :paid, status = :status WHERE id = :id")
            ->execute([':paid' => round($paid, 2), ':status' => $status, ':id' => $invoiceId]);
    }

    // ==========================================
    // HTTP UTILITIES
    // ==========================================
    protected function curlRequest(string $url, string $method, array $data, array $headers): array {
        $body = !empty($data) ? json_encode($data) : null;
        return $this->curlRequestRaw($url, $method, $body, $headers);
    }

    protected function curlRequestRaw(string $url, string $method, $body, array $headers): array {
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
        $err = curl_error($ch);
        curl_close($ch);

        if ($err) {
            throw new \Exception("Payment Gateway cURL Error: " . $err);
        }

        return json_decode($res, true) ?: [];
    }
}
