<?php
/**
 * Payments Module - Initialization & Checkout Endpoint (Facade)
 * POST /api/payments/checkout.php
 * 
 * Supports: Paystack, Flutterwave, Stripe, PayPal, and OPay
 */

require_once __DIR__ . '/../../config.php';

$input = getJsonInput();

$amount = floatval($input['amount'] ?? 0);
$currency = strtoupper(trim($input['currency'] ?? 'USD'));
$provider = strtolower(trim($input['provider'] ?? 'paystack'));
$email = trim($input['email'] ?? '');
$reference = trim($input['reference'] ?? '');
$callbackUrl = trim($input['callback_url'] ?? '');
$metadata = $input['metadata'] ?? [];

if ($amount <= 0 || empty($email)) {
    sendError("Amount and valid customer email are required.", 400);
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
        $metadata
    );

    sendSuccess($checkout, "Payment checkout initialized successfully.", 201);

} catch (Exception $e) {
    sendError("Checkout error: " . $e->getMessage(), 400);
}
