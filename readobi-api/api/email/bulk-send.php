<?php
/**
 * Email Module - Bulk Email Campaign Dispatch Endpoint
 * POST /api/email/bulk-send.php
 * 
 * Supports:
 * - Multi-recipient personalized dispatching
 * - Template variable interpolation per recipient (e.g. {{name}}, {{custom_code}})
 * - Global template variables
 * - Bulk delivery status metrics & logging
 */

require_once __DIR__ . '/../../config.php';

// Bulk campaign dispatching is restricted to administrators
$adminId = requireAdmin();
$currentUser = verifyAuthToken();
$orgId = (int)($currentUser['org_id'] ?? 1);

// Rate limiting: Max 5 bulk dispatch jobs per 15 minutes
\Alg\Security\RateLimiter::check('email_bulk_send', 5, 900);

$input = getJsonInput();

$recipients = $input['recipients'] ?? [];
$subject = trim($input['subject'] ?? '');
$template = trim($input['template'] ?? 'welcome');
$globalVars = $input['variables'] ?? [];

if (empty($recipients) || !is_array($recipients)) {
    sendError("Valid 'recipients' array is required.", 400);
}

if (empty($subject)) {
    sendError("Email 'subject' is required.", 400);
}

$mailer = new \Alg\Mail\Mailer();

$result = $mailer->sendBulk($recipients, $subject, $template, array_merge([
    'app_name' => Config::get('app_name', 'ALG Studio')
], $globalVars));

\Alg\Audit\AuditLogger::log('email.bulk_send', 'email_log', null, null, [
    'subject' => $subject,
    'total'   => $result['total_recipients'],
    'sent'    => $result['sent_count'],
    'failed'  => $result['failed_count']
], (int)($currentUser['id'] ?? 1), (int)($currentUser['org_id'] ?? 1));

sendSuccess($result, "Bulk email dispatch job completed.");
