<?php
/**
 * Email Module - Connectivity & Test Dispatch Endpoint
 * POST /api/email/test-email.php
 * 
 * Supports:
 * - Direct verification of SMTP/mail connectivity
 * - Sends a branded test email using the Mailer service
 * - Useful for health checks and frontend integration tests
 */

require_once __DIR__ . '/../../config.php';

// Rate limiting: Max 3 test emails per 5 minutes per IP
\Alg\Security\RateLimiter::check('test_email', 3, 300);

$input = getJsonInput();
$email = trim($input['email'] ?? $_GET['email'] ?? '');

$recipient = (!empty($email) && filter_var($email, FILTER_VALIDATE_EMAIL)) ? $email : 'admin@alg.company';

$mailer = new \Alg\Mail\Mailer();
$result = $mailer->sendTemplate($recipient, "ALG System Test Email - " . date('Y-m-d H:i:s'), 'welcome', [
    'name'      => 'ALG Engineer',
    'app_name'  => Config::get('app_name', 'ALG Studio API'),
    'login_url' => Config::get('app_url', 'http://localhost')
]);

sendSuccess([
    'service'   => 'alg-email-test-engine',
    'recipient' => $recipient,
    'status'    => $result['status'],
    'timestamp' => date('c'),
    'message'   => 'The ALG frontend can reach this API. Test email dispatched.'
], "Test email endpoint reached successfully.");
