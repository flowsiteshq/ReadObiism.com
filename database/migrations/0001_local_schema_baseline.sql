-- REVIEW ONLY: extracted from local Worker source, not verified against production.
-- Do not apply to an existing production database without an approved baseline and backup.
CREATE TABLE IF NOT EXISTS webhook_events (event_id TEXT PRIMARY KEY, event_type TEXT NOT NULL, status TEXT NOT NULL, received_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS purchases (checkout_session_id TEXT PRIMARY KEY, payment_intent_id TEXT, purchaser_email TEXT, amount_cents INTEGER NOT NULL, currency TEXT NOT NULL, product_sku TEXT NOT NULL, status TEXT NOT NULL, granted_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS reader_devices (checkout_session_id TEXT PRIMARY KEY, device_hash TEXT NOT NULL, claimed_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS device_transfer_challenges (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, checkout_session_id TEXT NOT NULL, old_device_hash TEXT NOT NULL, new_device_hash TEXT NOT NULL, code_hash TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, consumed_at TEXT);
CREATE INDEX IF NOT EXISTS device_transfer_challenges_account_idx ON device_transfer_challenges(account_id, created_at);
CREATE TABLE IF NOT EXISTS device_transfer_audit (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, checkout_session_id TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS gift_orders (code TEXT PRIMARY KEY, checkout_session_id TEXT UNIQUE NOT NULL, buyer_email TEXT NOT NULL, recipient_name TEXT NOT NULL, recipient_email TEXT NOT NULL, message TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL, redeemed_at TEXT);
CREATE INDEX IF NOT EXISTS gift_orders_email_idx ON gift_orders(recipient_email);
CREATE INDEX IF NOT EXISTS gift_orders_session_idx ON gift_orders(checkout_session_id);
CREATE TABLE IF NOT EXISTS book_sections (position INTEGER PRIMARY KEY, section_id TEXT UNIQUE NOT NULL, label TEXT NOT NULL, title TEXT NOT NULL, kind TEXT NOT NULL, paragraphs_json TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS purchases_email_idx ON purchases(purchaser_email);
CREATE TABLE IF NOT EXISTS obi_accounts (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, created_at TEXT NOT NULL, last_signed_in TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS obi_account_sessions (token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS account_sessions_account_idx ON obi_account_sessions(account_id);
CREATE TABLE IF NOT EXISTS request_limits (bucket TEXT PRIMARY KEY, window_start INTEGER NOT NULL, count INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS abuse_events (id TEXT PRIMARY KEY, route TEXT NOT NULL, limit_name TEXT NOT NULL, identity_hash TEXT NOT NULL, retry_after INTEGER NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS abuse_events_created_idx ON abuse_events(created_at);
