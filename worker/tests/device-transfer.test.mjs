import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import worker from '../dashboard-worker.js';
import { hashDeviceToken } from '../api/src/security.js';

function database() {
  const raw = new DatabaseSync(':memory:');
  const db = {
    exec: async (sql) => raw.exec(sql),
    prepare(sql) {
      const api = {
        sql,
        args: [],
        bind(...args) { api.args = args; return api; },
        first: async () => raw.prepare(sql).get(...api.args) || null,
        all: async () => ({ results: raw.prepare(sql).all(...api.args) }),
        run: async () => ({ meta: { changes: Number(raw.prepare(sql).run(...api.args).changes) } }),
      };
      return api;
    },
    batch: async (statements) => {
      raw.exec('BEGIN');
      try {
        const result = statements.map((statement) => ({
          meta: { changes: Number(raw.prepare(statement.sql).run(...statement.args).changes) },
        }));
        raw.exec('COMMIT');
        return result;
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      }
    },
    raw,
  };
  return db;
}

async function passwordHash(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
  const base64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
  return { hash: base64(bits), salt: base64(salt) };
}

async function seed(env) {
  const db = env.OBI_DB;
  const { hash, salt } = await passwordHash('correct horse battery staple');
  const sessionToken = 'session-token-for-transfer-test';
  const sessionHash = await hashDeviceToken(sessionToken);
  const oldDeviceToken = 'old-device-token-1234567890';
  const oldDeviceHash = await hashDeviceToken(oldDeviceToken);
  const now = new Date().toISOString();
  const sessionId = 'cs_test_' + 'a'.repeat(24);
  db.raw.exec(`CREATE TABLE IF NOT EXISTS obi_accounts (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, email_verified INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, last_signed_in TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS obi_account_sessions (token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS purchases (checkout_session_id TEXT PRIMARY KEY, payment_intent_id TEXT, purchaser_email TEXT, amount_cents INTEGER NOT NULL, currency TEXT NOT NULL, product_sku TEXT NOT NULL, status TEXT NOT NULL, granted_at TEXT NOT NULL, expires_at TEXT, edition_no INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS reader_devices (checkout_session_id TEXT PRIMARY KEY, device_hash TEXT NOT NULL, claimed_at TEXT NOT NULL, metadata_json TEXT);
    CREATE TABLE IF NOT EXISTS feature_flags (key TEXT PRIMARY KEY, enabled INTEGER NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT);`);
  db.raw.prepare("INSERT OR REPLACE INTO feature_flags (key,enabled,updated_at,updated_by) VALUES ('device_transfer',1,?,?)").run(now, 'test');
  db.raw.prepare('INSERT INTO obi_accounts (id,email,password_hash,password_salt,email_verified,created_at,last_signed_in) VALUES (?,?,?,?,1,?,?)')
    .run('acct_transfer', 'reader@example.test', hash, salt, now, now);
  db.raw.prepare('INSERT INTO obi_account_sessions (token_hash,account_id,created_at,expires_at) VALUES (?,?,?,?)')
    .run(sessionHash, 'acct_transfer', now, new Date(Date.now() + 86400000).toISOString());
  db.raw.prepare('INSERT INTO purchases (checkout_session_id,payment_intent_id,purchaser_email,amount_cents,currency,product_sku,status,granted_at,expires_at,edition_no) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(sessionId, null, 'reader@example.test', 699500, 'NGN', 'obi_ism_complete_edition', 'active', new Date(Date.now() - 4 * 86400000).toISOString(), new Date(Date.now() + 365 * 86400000).toISOString(), 1);
  db.raw.prepare('INSERT INTO reader_devices (checkout_session_id,device_hash,claimed_at) VALUES (?,?,?)')
    .run(sessionId, oldDeviceHash, now);
  return { sessionToken, sessionId, oldDeviceToken };
}

test('device transfer requires the account password and sends a code', async () => {
  const db = database();
  const env = { OBI_DB: db, RESEND_API_KEY: 're_fixture', ACCOUNT_FROM_EMAIL: 'OBI-ISM <no-reply@example.test>' };
  const seeded = await seed(env);
  const original = globalThis.fetch;
  let sentEmail = null;
  globalThis.fetch = async (url, init) => {
    sentEmail = JSON.parse(init.body);
    return Response.json({ id: 'email_test' });
  };
  try {
    const wrong = await worker.fetch(new Request('https://readobiism.com/api/reader/transfer/start', {
      method: 'POST',
      headers: { origin: 'https://readobiism.com', 'content-type': 'application/json', authorization: `Bearer ${seeded.sessionToken}` },
      body: JSON.stringify({ session_id: seeded.sessionId, device_token: 'new-device-token-1234567890', password: 'wrong password' }),
    }), env);
    assert.equal(wrong.status, 401);
    assert.equal(db.raw.prepare('SELECT count(*) n FROM device_transfer_challenges').get().n, 0);

    const response = await worker.fetch(new Request('https://readobiism.com/api/reader/transfer/start', {
      method: 'POST',
      headers: { origin: 'https://readobiism.com', 'content-type': 'application/json', authorization: `Bearer ${seeded.sessionToken}` },
      body: JSON.stringify({ session_id: seeded.sessionId, device_token: 'new-device-token-1234567890', password: 'correct horse battery staple' }),
    }), env);
    assert.equal(response.status, 200, await response.clone().text());
    assert.match((await response.json()).challengeId, /^transfer_/);
    assert.equal(db.raw.prepare('SELECT count(*) n FROM device_transfer_challenges').get().n, 1);
    assert.equal(sentEmail.subject, 'Confirm your OBI-ISM device move');
    assert.match(sentEmail.html, /OBI-ISM/);
    assert.match(sentEmail.html, /Confirm your new device/);
    assert.match(sentEmail.text, /expires in 10 minutes/i);
  } finally {
    globalThis.fetch = original;
  }
});

const localReq=(path,token,body)=>new Request('http://127.0.0.1:8799'+path,{method:'POST',headers:{origin:'http://127.0.0.1:8799','content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify(body)});
test('transfers are free within the configured period and paid afterward',async()=>{
 const db=database(),env={OBI_DB:db,OBI_LOCAL_TRANSFER_TEST:'1'},seeded=await seed(env);
 db.raw.prepare('UPDATE purchases SET granted_at=? WHERE checkout_session_id=?').run(new Date(Date.now()-71*3600000).toISOString(),seeded.sessionId);
 const args={session_id:seeded.sessionId,device_token:'new-device-token-1234567890',password:'correct horse battery staple'};
 const start=await worker.fetch(localReq('/api/reader/transfer/start',seeded.sessionToken,args),env);assert.equal(start.status,200,await start.clone().text());const challenge=await start.json();assert.equal(challenge.paymentRequired,false);assert.equal(challenge.transferFreeDays,3);
 const done=await worker.fetch(localReq('/api/reader/transfer/confirm',seeded.sessionToken,{challenge_id:challenge.challengeId,code:challenge.testCode,device_token:args.device_token}),env);assert.equal(done.status,200,await done.clone().text());
 const another={...args,device_token:'second-new-device-token-1234567890'};const second=await worker.fetch(localReq('/api/reader/transfer/start',seeded.sessionToken,another),env);const challenge2=await second.json();assert.equal(challenge2.paymentRequired,false);
 const done2=await worker.fetch(localReq('/api/reader/transfer/confirm',seeded.sessionToken,{challenge_id:challenge2.challengeId,code:challenge2.testCode,device_token:another.device_token}),env);assert.equal(done2.status,200,await done2.clone().text());assert.equal(db.raw.prepare('SELECT count(*) n FROM device_transfer_audit').get().n,2);
 db.raw.prepare('UPDATE purchases SET granted_at=? WHERE checkout_session_id=?').run(new Date(Date.now()-73*3600000).toISOString(),seeded.sessionId);
 const after=await worker.fetch(localReq('/api/reader/transfer/start',seeded.sessionToken,{...args,device_token:'third-new-device-token-1234567890'}),env);assert.equal(after.status,200);assert.equal((await after.json()).paymentRequired,true);
});
test('later transfer requires matching verified Paystack payment, is recoverable, and applies once',async()=>{
 const db=database(),env={OBI_DB:db,OBI_LOCAL_TRANSFER_TEST:'1',PAYSTACK_SECRET_KEY:'sk_test_fixture'},seeded=await seed(env);
 const oldHash=await hashDeviceToken(seeded.oldDeviceToken),newToken='another-device-token-1234567890';
 db.raw.prepare('CREATE TABLE IF NOT EXISTS device_transfer_audit (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, checkout_session_id TEXT NOT NULL, old_device_hash TEXT, new_device_hash TEXT, metadata_json TEXT, created_at TEXT NOT NULL)').run();
 db.raw.prepare('INSERT INTO device_transfer_audit VALUES (?,?,?,?,?,?,?)').run('audit_prior','acct_transfer',seeded.sessionId,'old',oldHash,'{}',new Date().toISOString());
 const original=globalThis.fetch;let tx=null,paid=false,wrongAmount=false;
 globalThis.fetch=async(url,init)=>{if(String(url).endsWith('/transaction/initialize')){tx=JSON.parse(init.body);return Response.json({status:true,data:{authorization_url:'https://checkout.paystack.com/example'}})}if(String(url).includes('/transaction/verify/'))return Response.json({status:true,data:{reference:tx.reference,status:paid?'success':'pending',domain:'test',currency:'NGN',amount:tx.amount+(wrongAmount?1:0),customer:{email:tx.email},metadata:tx.metadata}});throw Error('Unexpected '+url)};
 try{
  const args={session_id:seeded.sessionId,device_token:newToken,password:'correct horse battery staple'};
  const start=await worker.fetch(localReq('/api/reader/transfer/start',seeded.sessionToken,args),env);assert.equal(start.status,200,await start.clone().text());const challenge=await start.json();assert.equal(challenge.paymentRequired,true);
  const confirmed=await worker.fetch(localReq('/api/reader/transfer/confirm',seeded.sessionToken,{challenge_id:challenge.challengeId,code:challenge.testCode,device_token:newToken,currency:'NGN',quoted_total_minor:challenge.prices.NGN.total_minor,receipt_email:'other@example.test'}),env);assert.equal(confirmed.status,200,await confirmed.clone().text());const payment=await confirmed.json();assert.equal(payment.paymentRequired,true);assert.equal(tx.email,'reader@example.test');assert.equal(challenge.receiptEmail,'reader@example.test');
  assert.equal(db.raw.prepare('SELECT device_hash FROM reader_devices').get().device_hash,oldHash);
  const complete=()=>worker.fetch(localReq('/api/reader/transfer/payment/complete',seeded.sessionToken,{order_id:payment.orderId,device_token:newToken}),env);
  assert.equal((await complete()).status,409);assert.equal(db.raw.prepare('SELECT device_hash FROM reader_devices').get().device_hash,oldHash);
  paid=true;wrongAmount=true;assert.equal((await complete()).status,409);assert.equal(db.raw.prepare('SELECT device_hash FROM reader_devices').get().device_hash,oldHash);
  wrongAmount=false;const done=await complete();assert.equal(done.status,200,await done.clone().text());assert.equal(db.raw.prepare('SELECT device_hash FROM reader_devices').get().device_hash,await hashDeviceToken(newToken));assert.equal(db.raw.prepare('SELECT count(*) n FROM device_transfer_audit').get().n,2);
  assert.equal((await complete()).status,200);assert.equal(db.raw.prepare('SELECT count(*) n FROM device_transfer_audit').get().n,2);
 }finally{globalThis.fetch=original}
});

test('paid Stripe transfer verifies currency, total and test mode before changing devices',async()=>{
 const db=database(),env={OBI_DB:db,OBI_LOCAL_TRANSFER_TEST:'1',OBI_STRIPE_SECRET_KEY:'sk_test_fixture'},seeded=await seed(env),newToken='stripe-new-device-token-1234567890';
 const oldHash=await hashDeviceToken(seeded.oldDeviceToken);
 db.raw.prepare('CREATE TABLE IF NOT EXISTS device_transfer_audit (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, checkout_session_id TEXT NOT NULL, old_device_hash TEXT, new_device_hash TEXT, metadata_json TEXT, created_at TEXT NOT NULL)').run();
 db.raw.prepare('INSERT INTO device_transfer_audit VALUES (?,?,?,?,?,?,?)').run('audit_prior','acct_transfer',seeded.sessionId,'old',oldHash,'{}',new Date().toISOString());
 const original=globalThis.fetch;let data,paid=false,wrongMode=false;
 globalThis.fetch=async(url,init)=>{if(init.method==='POST'){data=new URLSearchParams(init.body);return Response.json({id:'cs_test_1234567890123456',url:'https://checkout.stripe.com/c/pay/test'})}return Response.json({id:'cs_test_1234567890123456',status:paid?'complete':'open',payment_status:paid?'paid':'unpaid',livemode:wrongMode,currency:'usd',amount_total:499,customer_email:'reader@example.test',metadata:{product_sku:data.get('metadata[product_sku]'),transfer_order_id:data.get('metadata[transfer_order_id]')}})};
 try{
 const start=await worker.fetch(localReq('/api/reader/transfer/start',seeded.sessionToken,{session_id:seeded.sessionId,device_token:newToken,password:'correct horse battery staple'}),env);const challenge=await start.json();assert.equal(challenge.paymentRequired,true);
 const confirm=await worker.fetch(localReq('/api/reader/transfer/confirm',seeded.sessionToken,{challenge_id:challenge.challengeId,code:challenge.testCode,device_token:newToken,currency:'USD',quoted_total_minor:499}),env);assert.equal(confirm.status,200,await confirm.clone().text());const order=await confirm.json();assert.equal(data.get('customer_email'),'reader@example.test');
 const complete=()=>worker.fetch(localReq('/api/reader/transfer/payment/complete',seeded.sessionToken,{order_id:order.orderId,device_token:newToken}),env);
 assert.equal((await complete()).status,409);paid=true;wrongMode=true;assert.equal((await complete()).status,409);assert.equal(db.raw.prepare('SELECT device_hash FROM reader_devices').get().device_hash,oldHash);wrongMode=false;const result=await complete();assert.equal(result.status,200,await result.clone().text());assert.equal(db.raw.prepare('SELECT device_hash FROM reader_devices').get().device_hash,await hashDeviceToken(newToken));
 }finally{globalThis.fetch=original}
});
test('phone-only account cannot request email verification to a synthetic address',async()=>{
 const db=database(),env={OBI_DB:db,OBI_LOCAL_TRANSFER_TEST:'1'},seeded=await seed(env);
 db.raw.prepare('UPDATE obi_accounts SET email=? WHERE id=?').run('2348012345678@phone.obiism.local','acct_transfer');
 db.raw.prepare('UPDATE purchases SET purchaser_email=? WHERE checkout_session_id=?').run('2348012345678@phone.obiism.local',seeded.sessionId);
 const response=await worker.fetch(localReq('/api/reader/transfer/start',seeded.sessionToken,{session_id:seeded.sessionId,device_token:'new-device-token-1234567890',password:'correct horse battery staple'}),env);
 assert.equal(response.status,409);assert.match((await response.json()).error,/valid email address/);
});
test('admin period changes apply immediately and zero makes the first move paid',async()=>{
 const db=database(),env={OBI_DB:db,OBI_LOCAL_TRANSFER_TEST:'1'},seeded=await seed(env);const now=new Date().toISOString();
 db.raw.prepare('CREATE TABLE IF NOT EXISTS site_settings (key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL,updated_by TEXT)').run();
 db.raw.prepare('INSERT INTO site_settings VALUES (?,?,?,?)').run('transfer_free_days','0',now,'admin');
 db.raw.prepare('UPDATE purchases SET granted_at=? WHERE checkout_session_id=?').run(new Date(Date.now()-3600000).toISOString(),seeded.sessionId);
 const args={session_id:seeded.sessionId,device_token:'new-device-token-1234567890',password:'correct horse battery staple'};
 const first=await worker.fetch(localReq('/api/reader/transfer/start',seeded.sessionToken,args),env);assert.equal((await first.json()).paymentRequired,true);
 db.raw.prepare("UPDATE site_settings SET value='7' WHERE key='transfer_free_days'").run();
 const second=await worker.fetch(localReq('/api/reader/transfer/start',seeded.sessionToken,args),env);const body=await second.json();assert.equal(body.paymentRequired,false);assert.equal(body.transferFreeDays,7);
 db.raw.prepare("UPDATE site_settings SET value='0' WHERE key='transfer_free_days'").run();
 const confirm=await worker.fetch(localReq('/api/reader/transfer/confirm',seeded.sessionToken,{challenge_id:body.challengeId,code:body.testCode,device_token:args.device_token}),env);
 assert.equal(confirm.status,409);assert.equal((await confirm.json()).code,'transfer_policy_changed');assert.equal(db.raw.prepare('SELECT device_hash FROM reader_devices').get().device_hash,await hashDeviceToken(seeded.oldDeviceToken));
});
test('pending transfer payment blocks a free move if the admin extends the period',async()=>{
 const db=database(),env={OBI_DB:db,OBI_LOCAL_TRANSFER_TEST:'1'},seeded=await seed(env),{ensureTransferPayments}=await import('../api/src/transfer-payments.js');
 const args={session_id:seeded.sessionId,device_token:'new-device-token-1234567890',password:'correct horse battery staple'};const start=await worker.fetch(localReq('/api/reader/transfer/start',seeded.sessionToken,args),env);assert.equal((await start.json()).paymentRequired,true);
 await ensureTransferPayments(env);const now=new Date().toISOString();db.raw.prepare("INSERT INTO transfer_payments (id,challenge_id,account_id,checkout_session_id,old_device_hash,new_device_hash,provider,currency,amount_minor,receipt_email,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").run('tpay_11111111111111111111111111111111','challenge_old','acct_transfer',seeded.sessionId,await hashDeviceToken(seeded.oldDeviceToken),await hashDeviceToken(args.device_token),'paystack','NGN',399500,'reader@example.test','pending',now,now);
 db.raw.prepare('INSERT INTO site_settings VALUES (?,?,?,?)').run('transfer_free_days','7',now,'admin');
 const next=await worker.fetch(localReq('/api/reader/transfer/start',seeded.sessionToken,args),env),challenge=await next.json();assert.equal(challenge.paymentRequired,false);
 const confirm=await worker.fetch(localReq('/api/reader/transfer/confirm',seeded.sessionToken,{challenge_id:challenge.challengeId,code:challenge.testCode,device_token:args.device_token}),env);assert.equal(confirm.status,409);assert.equal(db.raw.prepare('SELECT device_hash FROM reader_devices').get().device_hash,await hashDeviceToken(seeded.oldDeviceToken));
});
