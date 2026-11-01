<?php
// Local-only MySQL-first account registration. Called only from the loopback
// PHP development bridge; D1 delivery is idempotent and never contacts live.
declare(strict_types=1);

function localMysqlDb(): PDO {
    return new PDO('mysql:host=127.0.0.1;port=3306;dbname=obi_local_primary;charset=utf8mb4',
        getenv('OBI_MYSQL_LOCAL_USER') ?: 'root', getenv('OBI_MYSQL_LOCAL_PASSWORD') ?: '', [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
}

function localAccountSync(PDO $db, array $record, string $secret): string {
    $payload = json_encode([
        'id' => $record['id'], 'email' => $record['email'],
        'password_hash' => $record['password_hash'], 'password_salt' => $record['password_salt'],
        'created_at' => $record['created_at'],
    ], JSON_THROW_ON_ERROR);
    $curl = curl_init('http://127.0.0.1:8799/api/internal/local-mysql/account');
    curl_setopt_array($curl, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $payload,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-Obi-Local-Sync-Secret: ' . $secret],
        CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_CONNECTTIMEOUT => 3, CURLOPT_TIMEOUT => 10]);
    $result = curl_exec($curl);
    $status = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    curl_close($curl);
    $state = $result !== false && $status === 200 ? 'synced' : ($status === 409 ? 'conflict' : 'pending');
    $now = gmdate('Y-m-d\TH:i:s') . '.000Z';
    $db->beginTransaction();
    try {
        $stmt = $db->prepare('UPDATE obi_sync_outbox SET status=?,attempts=attempts+1,last_error=?,synced_at=? WHERE account_id=?');
        $stmt->execute([$state, $state === 'synced' ? null : ($state === 'conflict' ? 'Account conflicts with local D1.' : 'Local D1 sync unavailable.'), $state === 'synced' ? $now : null, $record['id']]);
        if ($state === 'synced') $db->prepare('UPDATE obi_accounts SET synced_at=? WHERE id=?')->execute([$now, $record['id']]);
        $db->commit();
    } catch (Throwable $error) { $db->rollBack(); throw $error; }
    return $state;
}

// Returns true only when the bridge should forward as a normal Worker login.
function prepareLocalMysqlAccount(string $action, string $body): bool {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin !== 'http://127.0.0.1:8899' || !str_starts_with(strtolower($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json')) failBridge(403, 'Request not allowed.');
    $input = json_decode($body, true);
    $email = is_array($input) && is_string($input['email'] ?? null) ? strtolower(trim($input['email'])) : '';
    $password = is_array($input) && is_string($input['password'] ?? null) ? $input['password'] : '';
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 254 || strlen($password) < 8 || strlen($password) > 128) failBridge(400, 'Enter a valid email and a password of at least 8 characters.');
    $secret = getenv('OBI_MYSQL_LOCAL_SYNC_SECRET') ?: '';
    if (!preg_match('/^[a-f0-9]{64}$/', $secret)) failBridge(503, 'Local MySQL account sync is not configured.');
    try {
        $db = localMysqlDb();
        if ($action === 'register') {
            $salt = random_bytes(16);
            $record = ['id' => 'acct_m_' . bin2hex(random_bytes(16)), 'email' => $email,
                'password_hash' => base64_encode(hash_pbkdf2('sha256', $password, $salt, 120000, 32, true)),
                'password_salt' => base64_encode($salt), 'created_at' => gmdate('Y-m-d\TH:i:s') . '.000Z'];
            $db->beginTransaction();
            try {
                $stmt = $db->prepare('INSERT INTO obi_accounts (id,email,password_hash,password_salt,created_at) VALUES (?,?,?,?,?)');
                $stmt->execute([$record['id'], $email, $record['password_hash'], $record['password_salt'], $record['created_at']]);
                $db->prepare("INSERT INTO obi_sync_outbox (id,account_id,event_type,created_at) VALUES (?,?,?,?)")
                    ->execute(['evt_m_' . bin2hex(random_bytes(16)), $record['id'], 'account.created', $record['created_at']]);
                $db->commit();
            } catch (PDOException $error) {
                if ($db->inTransaction()) $db->rollBack();
                if (($error->errorInfo[1] ?? 0) === 1062) failBridge(409, 'An account already exists for this email. Sign in instead.');
                throw $error;
            }
        } else {
            $stmt = $db->prepare('SELECT a.*,o.status AS sync_status FROM obi_accounts a JOIN obi_sync_outbox o ON o.account_id=a.id WHERE a.email=?');
            $stmt->execute([$email]);
            $record = $stmt->fetch(PDO::FETCH_ASSOC);
            // Existing Worker-only accounts continue to work during migration.
            if (!$record || $record['sync_status'] === 'conflict') return true;
            $salt = base64_decode($record['password_salt'], true);
            // Forward incorrect attempts to the Worker so its existing login
            // rate limit still applies; do not attempt a sync for them.
            if ($salt === false || !hash_equals($record['password_hash'], base64_encode(hash_pbkdf2('sha256', $password, $salt, 120000, 32, true)))) return true;
            if ($record['sync_status'] === 'synced') return true;
        }
        $state = localAccountSync($db, $record, $secret);
        if ($state === 'conflict') failBridge(409, 'This email already exists in local D1. Sign in with the existing account.');
        if ($state !== 'synced') failBridge(503, 'Account saved locally, but sync is pending. Start the local Worker and sign in to retry.');
        return true;
    } catch (Throwable $error) {
        if (isset($db) && $db->inTransaction()) $db->rollBack();
        failBridge(503, 'Local account service is unavailable. Check MySQL and retry.');
    }
}
