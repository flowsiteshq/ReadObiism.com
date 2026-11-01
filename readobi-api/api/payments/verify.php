<?php
/**
 * Payments Module - Verify Payment Status Endpoint
 * GET or POST /api/payments/verify.php
 * 
 * Supports:
 * - Verification across Paystack, Flutterwave, Stripe, PayPal, and OPay
 * - Automatic lookup of provider by reference if not explicitly supplied
 * - Updates database record to 'successful' or 'failed'
 * - Audit logging
 */

require_once __DIR__ . '/../../config.php';

$input = getJsonInput();
$reference = trim($_GET['reference'] ?? $input['reference'] ?? '');
$provider = strtolower(trim($_GET['provider'] ?? $input['provider'] ?? ''));

if (empty($reference)) {
    sendError("Transaction 'reference' is required for verification.", 400);
}

$db = getDbConnection();
if (empty($provider) && $db) {
    try {
        $stmt = $db->prepare("SELECT provider FROM payments WHERE reference = :ref LIMIT 1");
        $stmt->execute([':ref' => $reference]);
        $provider = $stmt->fetchColumn() ?: 'paystack';
    } catch (PDOException $e) {}
}

if (empty($provider)) {
    $provider = 'paystack';
}

$paymentManager = new \Alg\Payment\PaymentManager();

try {
    $verification = $paymentManager->verify($provider, $reference);

    \Alg\Audit\AuditLogger::log('payment.verified', 'payment', null, null, [
        'provider'  => $provider,
        'reference' => $reference,
        'status'    => $verification['status'] ?? 'unknown'
    ]);

    sendSuccess($verification, "Payment status verified successfully.");

} catch (Exception $e) {
    sendError("Verification error: " . $e->getMessage(), 400);
}
