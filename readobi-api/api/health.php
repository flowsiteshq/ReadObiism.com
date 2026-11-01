<?php
/**
 * Observability Module - System Health & Readiness Endpoint
 * GET /api/health.php
 */

require_once __DIR__ . '/../config.php';

$db = getDbConnection();
$dbStatus = $db ? "operational" : "offline_mode";

sendSuccess([
    "app_name" => Config::get('app_name'),
    "environment" => Config::get('app_env'),
    "status" => "healthy",
    "services" => [
        "database" => $dbStatus,
        "storage" => Config::get('storage_driver'),
        "api" => "v1_active"
    ],
    "memory_usage" => memory_get_usage(true)
], "System health check passed.");
