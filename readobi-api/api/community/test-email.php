<?php
/**
 * Community Module - Test Email / Connectivity Endpoint
 * POST /api/community/test-email.php
 *
 * Used by the ALG frontend "Test API Email" buttons (contact page,
 * Dashboard Settings & Alerts pages) to verify the API link end to end.
 */

require_once __DIR__ . '/../../config.php';

$input = getJsonInput();
$email = trim($input['email'] ?? $_GET['email'] ?? '');

$recipient = (!empty($email) && filter_var($email, FILTER_VALIDATE_EMAIL)) ? $email : 'demo@alg.company';

$mailer = new \Alg\Mail\Mailer();
$result = $mailer->sendTemplate($recipient, "ALG Community Connectivity Test", 'welcome', [
    'name'      => 'Community Member',
    'app_name'  => Config::get('app_name', 'ALG Studio API'),
    'login_url' => Config::get('app_url', 'http://localhost')
]);

sendSuccess([
    'service'   => 'alg-community-test-email',
    'email'     => $recipient,
    'sent'      => ($result['status'] === 'sent'),
    'message'   => 'The ALG frontend can reach this API. Test email dispatched.'
], "Test email endpoint reached successfully.");