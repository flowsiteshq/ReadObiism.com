<?php
/**
 * Payments Module - Initialize Checkout Endpoint
 * POST /api/payments/initialize.php
 * 
 * Supports:
 * - Providers: 'paystack', 'flutterwave', 'stripe', 'paypal', 'opay'
 * - Currency handling (NGN, USD, EUR, GBP, GHS, KES)
 * - Automatic database pending transaction recording
 * - Webhook / return URL dispatching
 */

require_once __DIR__ . '/../../config.php';

$currentUser = null;
try {
    $currentUser = verifyAuthToken();
} catch (Exception $e) {}

$userId = (int)($currentUser['id'] ?? 1);
$orgId = (int)($currentUser['org_id'] ?? 1);

$input = getJsonInput();

$provider = strtolower(trim($input['provider'] ?? 'paystack'));
$amount = floatval($input['amount'] ?? 0);
$currency = strtoupper(trim($input['currency'] ?? 'USD'));

// Rate limiting: Max 20 checkout requests per 10 minutes (prevents card testing bots)
\Alg\Security\RateLimiter::check('payment_init', 20, 600);

$email = trim($input['email'] ?? $currentUser['email'] ?? '');
$reference = trim($input['reference'] ?? '');
$callbackUrl = trim($input['callback_url'] ?? '');
$metadata = $input['metadata'] ?? [];

if ($amount <= 0) {
    sendError("Amount must be greater than 0.", 400);
}

if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    sendError("Valid customer email is required.", 422);
}

$paymentManager = new \Alg\Payment\PaymentManager();

try {
    $checkout = $paymentManager->initialize(
        $provider,
        $amount,
        $currency,
        $email,
        $reference ?: null,
        $callbackUrl ?: null,
        $metadata,
        $userId,
        $orgId
    );

    \Alg\Audit\AuditLogger::log('payment.initialize', 'payment', null, null, [
        'provider'  => $provider,
        'reference' => $checkout['reference'],
        'amount'    => $amount,
        'currency'  => $currency
    ], $userId, $orgId);

    sendSuccess($checkout, "Payment initialized successfully.", 201);

} catch (Exception $e) {
    sendError("Payment initialization failed: " . $e->getMessage(), 400);
}
