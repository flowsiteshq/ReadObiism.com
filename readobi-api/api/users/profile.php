<?php
/**
 * Users Module - User Profile Endpoint Alias
 * Maps to /api/auth/me.php so both /api/auth/me.php and /api/users/profile.php
 * handle user profile retrieval and updates.
 */

require_once __DIR__ . '/../auth/me.php';
