<?php
/**
 * ALG Company - WhatsApp & SMS Gateway Engine
 *
 * Unified SMS/WhatsApp provider abstraction supporting:
 * - Termii (Nigeria-focused SMS/WhatsApp API)
 * - Twilio (Global SMS/WhatsApp API)
 *
 * Features:
 * - Single send() facade across providers
 * - Bulk broadcast with per-recipient variable interpolation
 * - Delivery status tracking and database logging
 * - Graceful dev-mode simulator when credentials are absent
 * - Idempotent message deduplication via reference
 */

namespace Alg\Sms;

class SmsManager {
    protected $db;

    public function __construct($db = null) {
        $this->db = $db ?: getDbConnection();
    }

    /**
     * Send a single SMS/WhatsApp message across any supported provider.
     *
     * @param string $to        Recipient phone number (E.164 preferred, e.g. +2348012345678)
     * @param string $message   Message body
     * @param string $channel   'sms' | 'whatsapp'
     * @param string $provider  'termii' | 'twilio' (null = default from config)
     * @param string|null $reference Optional idempotency key
     * @param int|null $orgId   Tenant org id for logging
     * @param int|null $userId  Acting user id for logging
     * @return array ['status'=>'sent|failed|queued|delivered', 'provider'=>..., 'message_id'=>..., 'reference'=>...]
     */
    public function send(string $to, string $message, string $channel = 'sms', string $provider = null, ?string $reference = null, ?int $orgId = null, ?int $userId = null): array {
        $provider = $provider ?: \Config::get('sms_default_gateway', 'termii');
        $provider = strtolower(trim($provider));
        $channel  = strtolower(trim($channel));
        $reference = $reference ?: 'SMS_' . strtoupper($provider) . '_' . time() . '_' . bin2hex(random_bytes(4));

        // Idempotency: if this exact reference was already sent, return cached result.
        if ($this->db) {
            try {
                $stmt = $this->db->prepare("SELECT status, provider_message_id FROM sms_logs WHERE reference = :ref LIMIT 1");
                $stmt->execute([':ref' => $reference]);
                $existing = $stmt->fetch();
                if ($existing) {
                    return [
                        'status'      => $existing['status'],
                        'provider'    => $provider,
                        'message_id'  => $existing['provider_message_id'],
                        'reference'   => $reference,
                        'idempotent'  => true,
                    ];
                }
            } catch (\Throwable $e) {
                // Table may not exist yet; proceed without idempotency check.
            }
        }

        switch ($provider) {
            case 'termii':
                $result = $this->sendTermii($to, $message, $channel, $reference);
                break;
            case 'twilio':
                $result = $this->sendTwilio($to, $message, $channel, $reference);
                break;
            default:
                throw new \Exception("Unsupported SMS provider: {$provider}. Supported: termii, twilio.");
        }

        $status = $result['status'] ?? 'sent';
        $messageId = $result['message_id'] ?? null;

        // Persist delivery record
        $this->logMessage($to, $message, $channel, $provider, $status, $reference, $messageId, $orgId, $userId);

        return [
            'status'      => $status,
            'provider'    => $provider,
            'message_id'  => $messageId,
            'reference'   => $reference,
            'idempotent'  => false,
            'gateway_response' => $result['gateway_response'] ?? null,
        ];
    }

    /**
     * Broadcast a message to many recipients with per-recipient variable interpolation.
     * {{name}}, {{school}}, {{amount}}, {{due_date}}, {{invoice_no}} etc.
     *
     * @param array $recipients  [['to'=>'+234...', 'name'=>'Ada', ...], ...]
     * @param string $template   Message template with {{var}} placeholders
     * @param string $channel    'sms' | 'whatsapp'
     * @param string|null $provider
     * @return array summary {total, sent, failed, details:[...]}
     */
    public function broadcast(array $recipients, string $template, string $channel = 'sms', ?string $provider = null): array {
        $summary = ['total' => count($recipients), 'sent' => 0, 'failed' => 0, 'details' => []];
        foreach ($recipients as $rcpt) {
            $to = $rcpt['to'] ?? '';
            $body = $template;
            foreach ($rcpt as $key => $val) {
                if ($key === 'to') continue;
                $body = str_replace('{{' . $key . '}}', (string)$val, $body);
                $body = str_replace('{{ ' . $key . ' }}', (string)$val, $body);
            }
            $ref = 'SMS_BC_' . strtoupper($provider ?: 'default') . '_' . time() . '_' . bin2hex(random_bytes(3));
            try {
                $res = $this->send($to, $body, $channel, $provider, $ref, $rcpt['org_id'] ?? null, $rcpt['user_id'] ?? null);
                if (in_array($res['status'], ['sent', 'queued', 'delivered'], true)) {
                    $summary['sent']++;
                    $summary['details'][] = ['to' => $to, 'status' => 'sent', 'reference' => $res['reference']];
                } else {
                    $summary['failed']++;
                    $summary['details'][] = ['to' => $to, 'status' => 'failed', 'reference' => $res['reference'] ?? null];
                }
            } catch (\Throwable $e) {
                $summary['failed']++;
                $summary['details'][] = ['to' => $to, 'status' => 'error', 'error' => $e->getMessage()];
            }
        }
        return $summary;
    }

    // ========================================================================
    // 1. TERMII IMPLEMENTATION
    // ========================================================================
    protected function sendTermii(string $to, string $message, string $channel, string $reference): array {
        $apiKey = \Config::get('termii_api_key');
        $senderId = \Config::get('termii_sender_id', 'SCHOOLOS');

        if (empty($apiKey)) {
            // Dev mode: simulate successful delivery.
            return ['status' => 'queued', 'message_id' => 'dev_' . bin2hex(random_bytes(6)), 'gateway_response' => 'Simulated (Termii credentials not configured).'];
        }

        $isWhatsApp = $channel === 'whatsapp';
        $endpoint = $isWhatsApp
            ? 'https://api.ng.termii.com/api/messages/whatsapp/send'
            : 'https://api.ng.termii.com/api/sms/send';

        $payload = [
            'to'       => $this->normalizePhone($to),
            'from'     => $senderId,
            'sms'      => $message,
            'type'     => $isWhatsApp ? 'whatsapp' : 'plain',
            'channel'  => $isWhatsApp ? 'whatsapp' : 'dnd',
        ];

        $headers = [
            'Authorization: Bearer ' . $apiKey,
            'Content-Type: application/json',
        ];

        try {
            $res = $this->curlRequest($endpoint, 'POST', $payload, $headers);
            $status = !empty($res['code']) && $res['code'] === 'ok'
                ? 'sent'
                : 'failed';
            return [
                'status'           => $status,
                'message_id'       => $res['data']['message_id'] ?? $res['message_id'] ?? null,
                'gateway_response' => $res['message'] ?? $res['code'] ?? json_encode($res),
            ];
        } catch (\Throwable $e) {
            return ['status' => 'failed', 'message_id' => null, 'gateway_response' => $e->getMessage()];
        }
    }

    // ========================================================================
    // 2. TWILIO IMPLEMENTATION
    // ========================================================================
    protected function sendTwilio(string $to, string $message, string $channel, string $reference): array {
        $accountSid = \Config::get('twilio_account_sid');
        $authToken  = \Config::get('twilio_auth_token');
        $fromNumber = \Config::get('twilio_from_number');

        if (empty($accountSid) || empty($authToken) || empty($fromNumber)) {
            return ['status' => 'queued', 'message_id' => 'dev_' . bin2hex(random_bytes(6)), 'gateway_response' => 'Simulated (Twilio credentials not configured).'];
        }

        $isWhatsApp = $channel === 'whatsapp';
        $toFormatted = $isWhatsApp ? ('whatsapp:' . $this->normalizePhone($to)) : $this->normalizePhone($to);
        $fromFormatted = $isWhatsApp ? ('whatsapp:' . $fromNumber) : $fromNumber;

        $url = "https://api.twilio.com/2010-04-01/Accounts/{$accountSid}/Messages.json";
        $postData = http_build_query([
            'To'   => $toFormatted,
            'From' => $fromFormatted,
            'Body' => $message,
        ]);

        try {
            $res = $this->curlRequestRaw($url, 'POST', $postData, [
                'Authorization: Basic ' . base64_encode("{$accountSid}:{$authToken}"),
                'Content-Type: application/x-www-form-urlencoded',
            ]);
            $status = !empty($res['sid']) ? 'sent' : 'failed';
            return [
                'status'           => $status,
                'message_id'       => $res['sid'] ?? null,
                'gateway_response' => $res['status'] ?? $res['message'] ?? json_encode($res),
            ];
        } catch (\Throwable $e) {
            return ['status' => 'failed', 'message_id' => null, 'gateway_response' => $e->getMessage()];
        }
    }

    // ========================================================================
    // DATABASE HELPERS
    // ========================================================================
    protected function logMessage(string $to, string $message, string $channel, string $provider, string $status, string $reference, ?string $messageId, ?int $orgId, ?int $userId): void {
        if (!$this->db) return;
        try {
            $this->db->prepare("
                INSERT INTO sms_logs (org_id, user_id, to_phone, channel, provider, message, status, provider_message_id, reference, sent_at)
                VALUES (:org, :user, :to, :channel, :provider, :message, :status, :message_id, :reference, NOW())
            ")->execute([
                ':org'         => $orgId ?: 1,
                ':user'        => $userId ?: 1,
                ':to'          => $to,
                ':channel'     => $channel,
                ':provider'    => $provider,
                ':message'     => $message,
                ':status'      => $status,
                ':message_id'  => $messageId,
                ':reference'   => $reference,
            ]);
        } catch (\Throwable $e) {
            // Table may not exist yet; non-blocking.
        }
    }

    /** Normalise a phone number to E.164-ish form for gateway submission. */
    protected function normalizePhone(string $phone): string {
        $p = preg_replace('/[\s\-()]+/', '', trim($phone));
        if (strpos($p, '+') !== 0) {
            $p = '+' . ltrim($p, '+');
        }
        return $p;
    }

    // ========================================================================
    // HTTP UTILITIES
    // ========================================================================
    protected function curlRequest(string $url, string $method, array $data, array $headers): array {
        $body = !empty($data) ? json_encode($data) : null;
        return $this->curlRequestRaw($url, $method, $body, $headers);
    }

    protected function curlRequestRaw(string $url, string $method, $body, array $headers): array {
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);

        if ($method === 'POST' && $body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        }

        $res = curl_exec($ch);
        $err = curl_error($ch);
        curl_close($ch);

        if ($err) {
            throw new \Exception("SMS Gateway cURL Error: " . $err);
        }

        return json_decode($res, true) ?: [];
    }
}
