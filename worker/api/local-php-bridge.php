<?php
// Local development bridge: PHP forwards the existing OBI API contract to the
// isolated local Worker. This is deliberately not a production PHP backend.
declare(strict_types=1);

function failBridge(int $status, string $message): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode(['error' => $message]);
    exit;
}

if (PHP_SAPI !== 'cli-server' || ($_SERVER['REMOTE_ADDR'] ?? '') !== '127.0.0.1'
    || ($_SERVER['HTTP_HOST'] ?? '') !== '127.0.0.1:8899') {
    failBridge(403, 'This bridge is available only for local development.');
}
$uri = $_SERVER['REQUEST_URI'] ?? '';
$path = parse_url($uri, PHP_URL_PATH);
if (!is_string($path) || !str_starts_with($path, '/api/') || preg_match('/[\x00-\x20\x7f]/', $uri)) {
    failBridge(404, 'Not found.');
}
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
if (!in_array($method, ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], true)) {
    failBridge(405, 'Method not allowed.');
}
if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 1048576) failBridge(413, 'Request is too large.');
$body = file_get_contents('php://input', false, null, 0, 1048577);
if ($body === false || strlen($body) > 1048576) failBridge(413, 'Request is too large.');

if (getenv('OBI_MYSQL_LOCAL_ENABLED') === '1' && $method === 'POST'
    && in_array($path, ['/api/account/register', '/api/account/login'], true)) {
    require_once __DIR__ . '/mysql-local-accounts.php';
    prepareLocalMysqlAccount($path === '/api/account/register' ? 'register' : 'login', $body);
    if ($path === '/api/account/register') $uri = '/api/account/login';
}

$headers = [];
foreach (['CONTENT_TYPE' => 'Content-Type', 'HTTP_ACCEPT' => 'Accept', 'HTTP_AUTHORIZATION' => 'Authorization',
    'HTTP_COOKIE' => 'Cookie', 'HTTP_X_OBI_DEVICE_TOKEN' => 'X-Obi-Device-Token'] as $serverKey => $headerName) {
    $value = $_SERVER[$serverKey] ?? '';
    if (is_string($value) && $value !== '' && !preg_match('/[\r\n]/', $value)) $headers[] = $headerName . ': ' . $value;
}
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin === 'http://127.0.0.1:8899') $origin = 'http://127.0.0.1:8799';
if ($origin !== '' && !preg_match('/[\r\n]/', $origin)) $headers[] = 'Origin: ' . $origin;

$responseHeaders = [];
$curl = curl_init('http://127.0.0.1:8799' . $uri);
curl_setopt_array($curl, [
    CURLOPT_CUSTOMREQUEST => $method,
    CURLOPT_HTTPHEADER => $headers,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_CONNECTTIMEOUT => 3,
    CURLOPT_TIMEOUT => 30,
    CURLOPT_HEADERFUNCTION => static function ($handle, string $line) use (&$responseHeaders): int {
        $length = strlen($line);
        if (preg_match('/^(content-type|cache-control|set-cookie|retry-after|location):\s*(.+?)\s*$/i', $line, $m)) {
            $responseHeaders[] = [$m[1], $m[2]];
        }
        return $length;
    },
]);
if ($method !== 'GET' && $method !== 'OPTIONS') curl_setopt($curl, CURLOPT_POSTFIELDS, $body);
$response = curl_exec($curl);
$status = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
curl_close($curl);
if ($response === false || $status < 100) failBridge(502, 'Local Worker is unavailable. Start it and retry.');
http_response_code($status);
foreach ($responseHeaders as [$name, $value]) header($name . ': ' . $value, false);
echo $response;
