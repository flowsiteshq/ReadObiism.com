<?php
/**
 * Settings Module - Save Project Settings Endpoint
 * POST /api/settings/save.php
 *
 * Body: { "section": "general", "key": "appName", "value": "..." }
 *
 * Demo implementation echoes back the stored value. In production this
 * would persist to your settings store (DB / cache / file).
 */

require_once __DIR__ . '/../../config.php';

// Authorization: Only administrators can modify project settings
$adminId = requireAdmin();
$currentUser = verifyAuthToken();
$orgId = (int)($currentUser['org_id'] ?? 1);

$input = getJsonInput();

$section = trim($input['section'] ?? 'general');
$key = trim($input['key'] ?? '');
$value = $input['value'] ?? '';

if (empty($key)) {
    sendError("A settings key is required.", 400);
}

if (is_string($value)) {
    $value = trim($value);
}

sendSuccess([
    'section' => $section,
    'key' => $key,
    'value' => $value,
    'saved_at' => date('c'),
], "Setting saved successfully.");