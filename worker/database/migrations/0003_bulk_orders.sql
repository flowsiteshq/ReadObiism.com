-- Production bulk orders schema
CREATE TABLE IF NOT EXISTS bulk_orders (
  id TEXT PRIMARY KEY,
  code_hash TEXT UNIQUE NOT NULL,
  code_last4 TEXT NOT NULL,
  buyer_email TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 10000),
  currency TEXT NOT NULL CHECK(currency IN ('USD','NGN')),
  unit_amount_minor INTEGER NOT NULL,
  total_minor INTEGER NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN ('stripe','paystack')),
  provider_reference TEXT UNIQUE,
  stripe_session_id TEXT UNIQUE,
  code_encrypted TEXT,
  status TEXT NOT NULL CHECK(status IN ('pending','paid','expired','cancelled','refunded','disputed','partially_refunded')),
  discount_percentage INTEGER,
  discount_note TEXT,
  discount_approved_by TEXT,
  created_at TEXT NOT NULL,
  paid_at TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS bulk_order_claims (
  order_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  checkout_session_id TEXT UNIQUE NOT NULL,
  claimed_at TEXT NOT NULL,
  PRIMARY KEY(order_id, account_id)
);
CREATE INDEX IF NOT EXISTS bulk_order_claims_order_idx ON bulk_order_claims(order_id);
CREATE INDEX IF NOT EXISTS bulk_order_claims_account_idx ON bulk_order_claims(account_id);
CREATE TABLE IF NOT EXISTS bulk_order_events (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor TEXT,
  details TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id TEXT PRIMARY KEY,
  admin_email TEXT NOT NULL,
  action TEXT NOT NULL,
  path TEXT NOT NULL,
  ip TEXT,
  created_at TEXT NOT NULL
);
ALTER TABLE obi_accounts ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS account_verification_challenges (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed_at TEXT
);
CREATE INDEX IF NOT EXISTS account_verification_challenges_account_idx ON account_verification_challenges(account_id, created_at);
