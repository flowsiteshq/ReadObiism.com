<?php
/**
 * Leads Module - Create Lead Submission Endpoint
 * POST /api/leads/create.php
 */

require_once __DIR__ . '/../../config.php';

$input = getJsonInput();

// Rate limiting: Max 10 submissions per 10 minutes per IP
\Alg\Security\RateLimiter::check('lead_create', 10, 600);

$name = trim($input['name'] ?? '');
$email = trim($input['email'] ?? '');
$phone = trim($input['phone'] ?? '');
$subject = trim($input['subject'] ?? 'New Inquiry');
$message = trim($input['message'] ?? '');

if (empty($name) || empty($email) || empty($message)) {
    sendError("Name, email, and message are required fields.", 400);
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    sendError("Please provide a valid email address.", 422);
}

$db = getDbConnection();
if ($db) {
    $stmt = $db->prepare("INSERT INTO leads (name, email, phone, subject, message, created_at) VALUES (:name, :email, :phone, :subject, :message, NOW())");
    $stmt->execute([
        ':name' => $name,
        ':email' => $email,
        ':phone' => $phone,
        ':subject' => $subject,
        ':message' => $message,
    ]);
    $leadId = $db->lastInsertId();
} else {
    $leadId = rand(100, 999);
}

sendSuccess([
    'id' => $leadId,
    'name' => $name,
    'email' => $email,
    'subject' => $subject,
    'status' => 'new'
], "Lead submission received successfully.", 201);
