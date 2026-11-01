<?php
/**
 * Settings Module - Get Project Settings Endpoint
 * GET /api/settings/get.php
 *
 * Returns the current brand & general settings for the ALG dashboard
 * (Settings page + Content Editor). Replace the demo payload with your
 * own application settings store in production.
 */

require_once __DIR__ . '/../../config.php';

sendSuccess([
    'brand' => [
        'primary'   => '#1229ad',
        'secondary' => '#a0ff27',
        'accent'    => '#ec6fd5',
    ],
    'general' => [
        'appName'   => 'ALG Company Boilerplate',
        'baseURL'   => getenv('APP_URL') ?: 'https://api.algorithm.institute/studio/api',
    ],
    'content' => [
        'homepage_intro' => [
            'key'   => 'homepage_intro',
            'value' => '<p>Welcome to ALG Studio — a studio that ships.</p>',
        ],
    ],
], "Project settings retrieved.");