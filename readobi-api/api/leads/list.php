<?php
/**
 * Leads Module - List Lead Submissions Endpoint
 * GET /api/leads/list.php
 */

require_once __DIR__ . '/../../config.php';

// Verify Auth Token for Dashboard Access
$user = verifyAuthToken();

$db = getDbConnection();
if ($db) {
    $stmt = $db->query("SELECT * FROM leads ORDER BY id DESC LIMIT 50");
    $leads = $stmt->fetchAll();
} else {
    // Mock data if DB connection is offline
    $leads = [
        [
            'id' => 101,
            'name' => 'Sarah Jenkins',
            'email' => 'sarah@acme.corp',
            'subject' => 'Web Design Project',
            'message' => 'Looking to redesign our corporate website.',
            'status' => 'new',
            'created_at' => date('Y-m-d H:i:s')
        ],
        [
            'id' => 102,
            'name' => 'Michael Chang',
            'email' => 'michael@tech.io',
            'subject' => 'API Integration Consultation',
            'message' => 'Need help integrating REST API backend.',
            'status' => 'contacted',
            'created_at' => date('Y-m-d H:i:s', strtotime('-1 day'))
        ]
    ];
}

sendSuccess($leads, "Leads retrieved successfully.");
