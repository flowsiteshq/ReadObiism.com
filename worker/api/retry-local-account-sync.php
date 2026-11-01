<?php
// Retry pending test-account events. CLI only; never connects to live D1.
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once __DIR__ . '/mysql-local-accounts.php';
$secret = getenv('OBI_MYSQL_LOCAL_SYNC_SECRET') ?: '';
if (!preg_match('/^[a-f0-9]{64}$/', $secret)) { fwrite(STDERR, "Local sync configuration is missing.\n"); exit(1); }
$watch = in_array('--watch', $argv, true);
do {
    try {
        $db = localMysqlDb();
        $rows = $db->query("SELECT a.* FROM obi_accounts a JOIN obi_sync_outbox o ON o.account_id=a.id WHERE o.status='pending' ORDER BY o.created_at LIMIT 100")->fetchAll(PDO::FETCH_ASSOC);
        $counts = ['synced' => 0, 'pending' => 0, 'conflict' => 0];
        foreach ($rows as $row) $counts[localAccountSync($db, $row, $secret)]++;
        if (count($rows)) echo 'Local account sync: ' . $counts['synced'] . ' synced, ' . $counts['pending'] . ' pending, ' . $counts['conflict'] . " conflicts.\n";
        $db = null;
    } catch (Throwable $error) {
        fwrite(STDERR, "Local account sync could not reach its database.\n");
        if (!$watch) exit(1);
    }
    if ($watch) sleep(5);
} while ($watch);
