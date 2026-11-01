<?php
/**
 * Email Module - Transactional Email Dispatch Endpoint
 * POST /api/email/send.php
 * 
 * Supports:
 * - Direct HTML / text email sending
 * - Template-based email dispatching (welcome, reset-password, verify-email, otp-code)
 * - Variable interpolation
 * - Database delivery logging
 */

require_once __DIR__ . '/../../config.php';

// Authentication required to send transactional emails (prevents open mail relay)
$userId = requireAuth();
$currentUser = verifyAuthToken();
$orgId = (int)($currentUser['org_id'] ?? 1);

// Rate limiting: Max 20 emails per 5 minutes per user
\Alg\Security\RateLimiter::check('email_send', 20, 300);

$input = getJsonInput();

$to = trim($input['to'] ?? '');
$subject = trim($input['subject'] ?? '');
$template = trim($input['template'] ?? '');
$variables = $input['variables'] ?? [];
$body = $input['body'] ?? '';

if (empty($to) || !filter_var($to, FILTER_VALIDATE_EMAIL)) {
    sendError("Valid recipient email ('to') is required.", 422);
}

if (empty($subject)) {
    sendError("Email 'subject' is required.", 400);
}

$mailer = new \Alg\Mail\Mailer();

if (!empty($template)) {
    // Template-based email
    $result = $mailer->sendTemplate($to, $subject, $template, array_merge([
        'app_name' => Config::get('app_name', 'ALG Studio')
    ], $variables));
} else {
    // Raw HTML body
    if (empty($body)) {
        sendError("Either 'template' or 'body' must be provided.", 400);
    }
    $result = $mailer->send($to, $subject, $body);
}

if ($result['status'] === 'sent') {
    \Alg\Audit\AuditLogger::log('email.sent', 'email_log', (int)($result['log_id'] ?? 0), null, ['to' => $to, 'subject' => $subject], (int)($currentUser['id'] ?? 1), (int)($currentUser['org_id'] ?? 1));
    sendSuccess($result, "Email dispatched successfully.");
} else {
    sendError("Failed to send email: " . ($result['error'] ?? 'Unknown mail error'), 500);
}
