// Read-only administrative views. Never return password, session or device hashes.
import { ensureBulkOrders } from './bulk-orders.js';
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const rows = async (db, sql, ...args) => (await db.prepare(sql).bind(...args).all()).results;

export async function adminData(request, env) {
  const url = new URL(request.url), db = env.OBI_DB;
  if (url.pathname === '/api/admin/payment-status') {
    return json({
      paystack: { secretConfigured: typeof env.PAYSTACK_SECRET_KEY === 'string' && env.PAYSTACK_SECRET_KEY.startsWith('sk_') },
      stripe: { secretConfigured: typeof env.OBI_STRIPE_SECRET_KEY === 'string' && env.OBI_STRIPE_SECRET_KEY.startsWith('sk_'), webhookConfigured: typeof env.OBI_STRIPE_WEBHOOK_SECRET === 'string' && env.OBI_STRIPE_WEBHOOK_SECRET.startsWith('whsec_') },
    });
  }
  if (url.pathname === '/api/admin/overview') {
    const totals = await db.prepare(`SELECT
      (SELECT COUNT(*) FROM obi_accounts) AS readers,
      (SELECT COUNT(*) FROM purchases) AS purchases,
      (SELECT COUNT(*) FROM purchases WHERE status='active') AS active_editions,
      (SELECT COUNT(*) FROM reader_devices WHERE device_hash!='UNBOUND') AS devices,
      (SELECT COUNT(*) FROM gift_orders) AS gifts,
      (SELECT COUNT(*) FROM book_sections) AS sections,
      (SELECT COUNT(*) FROM device_transfer_audit) AS transfers`).first();
    const [registrations, purchases, statuses] = await Promise.all([
      rows(db, "SELECT substr(created_at,1,10) AS day, COUNT(*) AS total FROM obi_accounts WHERE date(created_at)>=date('now','-29 days') GROUP BY day ORDER BY day"),
      rows(db, "SELECT substr(granted_at,1,10) AS day, COUNT(*) AS total FROM purchases WHERE date(granted_at)>=date('now','-29 days') GROUP BY day ORDER BY day"),
      rows(db, "SELECT status, COUNT(*) AS total FROM purchases GROUP BY status ORDER BY total DESC"),
    ]);
    return json({ totals, registrations, purchases, statuses });
  }
  if (url.pathname === '/api/admin/bulk-orders') {
    await ensureBulkOrders(env);
  }
  const page = Math.max(1, Math.min(10000, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1));
  const size = 10, offset = (page - 1) * size;
  const search = (url.searchParams.get('q') || '').trim().slice(0, 100);
  const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
  let query, count;
  if (url.pathname === '/api/admin/readers') {
    query = `SELECT a.id,a.email,a.created_at,a.last_signed_in,
      (SELECT COUNT(*) FROM purchases p LEFT JOIN gift_orders g ON g.checkout_session_id=p.checkout_session_id
       WHERE p.status='active' AND ((g.checkout_session_id IS NULL AND lower(p.purchaser_email)=lower(a.email))
       OR (g.status='redeemed' AND lower(g.recipient_email)=lower(a.email)))) AS active_editions
      FROM obi_accounts a WHERE a.email LIKE ? ESCAPE '\\' OR a.id LIKE ? ESCAPE '\\' ORDER BY a.created_at DESC LIMIT ? OFFSET ?`;
    count = "SELECT COUNT(*) AS total FROM obi_accounts WHERE email LIKE ? ESCAPE '\\' OR id LIKE ? ESCAPE '\\'";
  } else if (url.pathname === '/api/admin/purchases') {
    query = "SELECT checkout_session_id,purchaser_email,amount_cents,currency,status,granted_at,CASE WHEN payment_intent_id LIKE 'local-bulk-test:%' THEN 'Local bulk test' ELSE 'Checkout record' END AS source FROM purchases WHERE purchaser_email LIKE ? ESCAPE '\\' OR checkout_session_id LIKE ? ESCAPE '\\' ORDER BY granted_at DESC LIMIT ? OFFSET ?";
    count = "SELECT COUNT(*) AS total FROM purchases WHERE purchaser_email LIKE ? ESCAPE '\\' OR checkout_session_id LIKE ? ESCAPE '\\'";
  } else if (url.pathname === '/api/admin/devices') {
    query = `SELECT d.checkout_session_id,d.claimed_at,p.purchaser_email,
      CASE WHEN d.device_hash='UNBOUND' THEN 'Awaiting activation' ELSE 'Bound' END AS binding_status
      FROM reader_devices d LEFT JOIN purchases p ON p.checkout_session_id=d.checkout_session_id
      WHERE d.checkout_session_id LIKE ? ESCAPE '\\' OR p.purchaser_email LIKE ? ESCAPE '\\' ORDER BY d.claimed_at DESC LIMIT ? OFFSET ?`;
    count = "SELECT COUNT(*) AS total FROM reader_devices d LEFT JOIN purchases p ON p.checkout_session_id=d.checkout_session_id WHERE d.checkout_session_id LIKE ? ESCAPE '\\' OR p.purchaser_email LIKE ? ESCAPE '\\'";
  } else if (url.pathname === '/api/admin/gifts') {
    query = "SELECT buyer_email,recipient_email,checkout_session_id,status,created_at,redeemed_at,substr(code,-4) AS code_last4 FROM gift_orders WHERE buyer_email LIKE ? ESCAPE '\\' OR recipient_email LIKE ? ESCAPE '\\' OR checkout_session_id LIKE ? ESCAPE '\\' ORDER BY created_at DESC LIMIT ? OFFSET ?";
    count = "SELECT COUNT(*) AS total FROM gift_orders WHERE buyer_email LIKE ? ESCAPE '\\' OR recipient_email LIKE ? ESCAPE '\\' OR checkout_session_id LIKE ? ESCAPE '\\'";
  } else if (url.pathname === '/api/admin/content') {
    query = "SELECT section_id,label,title,kind,position FROM book_sections WHERE title LIKE ? ESCAPE '\\' OR section_id LIKE ? ESCAPE '\\' ORDER BY position LIMIT ? OFFSET ?";
    count = "SELECT COUNT(*) AS total FROM book_sections WHERE title LIKE ? ESCAPE '\\' OR section_id LIKE ? ESCAPE '\\'";
  } else if (url.pathname === '/api/admin/transfers') {
    query = "SELECT t.checkout_session_id,t.created_at,a.email FROM device_transfer_audit t LEFT JOIN obi_accounts a ON a.id=t.account_id WHERE t.checkout_session_id LIKE ? ESCAPE '\\' OR a.email LIKE ? ESCAPE '\\' ORDER BY t.created_at DESC LIMIT ? OFFSET ?";
    count = "SELECT COUNT(*) AS total FROM device_transfer_audit t LEFT JOIN obi_accounts a ON a.id=t.account_id WHERE t.checkout_session_id LIKE ? ESCAPE '\\' OR a.email LIKE ? ESCAPE '\\'";
  } else if (url.pathname === '/api/admin/bulk-orders') {
    query = "SELECT id,buyer_email,quantity,currency,total_minor,provider,status,discount_percentage,created_at,paid_at FROM bulk_orders WHERE buyer_email LIKE ? ESCAPE '\\' OR id LIKE ? ESCAPE '\\' ORDER BY created_at DESC LIMIT ? OFFSET ?";
    count = "SELECT COUNT(*) AS total FROM bulk_orders WHERE buyer_email LIKE ? ESCAPE '\\' OR id LIKE ? ESCAPE '\\'";
  } else return json({ error: 'Not found' }, 404);
  const filters = url.pathname === '/api/admin/gifts' ? [pattern, pattern, pattern] : [pattern, pattern];
  const [items, total] = await Promise.all([rows(db, query, ...filters, size, offset), db.prepare(count).bind(...filters).first()]);
  return json({ items, total: total.total, page, pageSize: size });
}
