-- Local test prototype only. Additive: existing Paystack records remain unchanged.
CREATE TABLE IF NOT EXISTS bulk_local_payment_details (order_id TEXT PRIMARY KEY, provider TEXT NOT NULL CHECK(provider IN ('paystack','stripe')), currency TEXT NOT NULL, unit_amount_minor INTEGER NOT NULL, total_minor INTEGER NOT NULL, stripe_session_id TEXT);
