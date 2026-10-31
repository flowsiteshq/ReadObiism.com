-- Synthetic data for an isolated local D1 integration check ONLY.
-- The test account is created through the local registration API first.
-- Never apply this file to staging with real customers or to production.
INSERT OR IGNORE INTO purchases
  (checkout_session_id, payment_intent_id, purchaser_email, amount_cents, currency, product_sku, status, granted_at)
VALUES
  ('obi_localsmoketest00000000001', 'synthetic-local-only', 'smoke-reader@obi.test', 995, 'USD', 'obi_ism_complete_edition', 'active', '2026-01-01T00:00:00.000Z');

INSERT OR IGNORE INTO book_sections
  (position, section_id, label, title, kind, paragraphs_json)
VALUES
  (0, 'smoke-test-section', 'TEST SECTION', 'Local integration test', 'chapter', '["This is synthetic text used to verify the local reader integration. It is not the OBI-ISM manuscript."]');
