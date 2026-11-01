<?php
/**
 * Statistics Module - Dashboard KPI Summary Endpoint
 * GET /api/statistics/summary.php
 *
 * Field contract shared with the ALG frontend dashboard (index.html):
 *   totalRevenue  -> Stat "Revenue"
 *   leadCount     -> Stat "New leads"
 *   emailsSent    -> Stat "Emails sent"
 *   activeProjects-> Stat "Active projects"
 *   trend         -> Revenue trend series (30 points) for the primary chart
 *   chartData     -> Leads-by-source labels/values for the doughnut chart
 *   recentLeads   -> Latest leads for the overview table
 */

require_once __DIR__ . '/../../config.php';

// Verify Auth Token for Dashboard Access
$user = verifyAuthToken();

$db = getDbConnection();

// Mock trend series (replaced by real analytics in production)
$trend = [32, 41, 45, 38, 52, 58, 55, 61, 64, 70, 68, 74, 78, 73, 81, 84, 79, 88, 92, 89, 95, 101, 98, 105, 112, 109, 118, 122, 120, 128];

$recentLeads = [];
if ($db) {
    $stmt = $db->query("SELECT id, name, email, subject, status, created_at FROM leads ORDER BY id DESC LIMIT 5");
    $recentLeads = $stmt->fetchAll();
} else {
    $recentLeads = [
        ['id' => 101, 'name' => 'Sarah Jenkins', 'email' => 'sarah@acme.corp', 'subject' => 'Web Design Project', 'status' => 'new', 'created_at' => date('Y-m-d H:i:s')],
        ['id' => 102, 'name' => 'Michael Chang', 'email' => 'michael@tech.io', 'subject' => 'API Integration', 'status' => 'contacted', 'created_at' => date('Y-m-d H:i:s', strtotime('-1 day'))]
    ];
}

sendSuccess([
    'totalRevenue'   => 48217,
    'leadCount'      => 1284,
    'emailsSent'     => 356,
    'activeProjects' => 12,
    'conversion_rate' => 4.8,
    'trend'          => $trend,
    'chartData'      => [
        'labels' => ['Organic', 'Ads', 'Referral', 'Social'],
        'values' => [46, 26, 16, 12]
    ],
    'recentLeads'    => $recentLeads
], "Dashboard statistics retrieved.");