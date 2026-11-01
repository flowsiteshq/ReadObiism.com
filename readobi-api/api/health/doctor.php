<?php
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, OPTIONS");

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once '../../config.php';

$db = getDbConnection();

$diagnostics = [
    "php_version" => PHP_VERSION,
    "php_ok" => PHP_VERSION_ID >= 80000,
    "extensions" => [
        "pdo_mysql" => extension_loaded('pdo_mysql'),
        "curl" => extension_loaded('curl'),
        "json" => extension_loaded('json'),
        "openssl" => extension_loaded('openssl')
    ],
    "storage" => [
        "uploads_writable" => is_writable(__DIR__ . '/../../uploads')
    ],
    "database" => [
        "connected" => $db !== null
    ]
];

$allOk = $diagnostics['php_ok'] && $diagnostics['extensions']['pdo_mysql'] && $diagnostics['storage']['uploads_writable'];

http_response_code($allOk ? 200 : 500);

echo json_encode([
    "success" => $allOk,
    "data" => $diagnostics,
    "message" => $allOk ? "System diagnostics passed successfully." : "System diagnostic failures detected.",
    "timestamp" => date('c')
]);
