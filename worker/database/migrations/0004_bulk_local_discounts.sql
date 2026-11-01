-- Local test prototype only. Preserve discount details for each test payment.
CREATE TABLE IF NOT EXISTS bulk_local_discounts (order_id TEXT PRIMARY KEY, percentage INTEGER NOT NULL CHECK(percentage BETWEEN 1 AND 99), approval_note TEXT NOT NULL, approved_by TEXT NOT NULL);
