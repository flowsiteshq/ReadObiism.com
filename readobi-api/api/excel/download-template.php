<?php
/**
 * Excel / CSV Management - Download Import Template
 * GET /api/excel/download-template.php?type=users
 * 
 * Streams a pre-formatted CSV template file with standard column headers
 * and sample instruction rows for easy bulk population.
 */

$type = $_GET['type'] ?? 'users';

if ($type === 'leads') {
    $filename = "alg-leads-import-template.csv";
    $headers = ["Name", "Email", "Phone", "Subject", "Message"];
    $sample = [
        ["Jane Doe", "jane@example.com", "+1 555-0199", "Project Inquiry", "Interested in redesigning our platform."],
        ["Alex Rivera", "alex@startup.co", "+44 7700 900077", "API Integration", "Need custom REST API setup."]
    ];
} else {
    // Default: users template
    $filename = "alg-users-import-template.csv";
    $headers = ["Name", "Email", "Phone", "Role", "Status"];
    $sample = [
        ["Jane Doe", "jane@example.com", "+1 555-0101", "user", "active"],
        ["David Smith", "david@example.com", "+1 555-0102", "manager", "active"],
        ["Sarah Connor", "sarah@example.com", "+1 555-0103", "staff", "active"]
    ];
}

header('Content-Type: text/csv; charset=UTF-8');
header('Content-Disposition: attachment; filename="' . $filename . '"');
header('Pragma: no-cache');
header('Expires: 0');

$output = fopen('php://output', 'w');
fputcsv($output, $headers);

foreach ($sample as $row) {
    fputcsv($output, $row);
}

fclose($output);
exit();
