import { paystackQuote } from './paystack-fees.js';
import { isFeatureEnabled } from './feature-flags.js';

export const TRANSFER_NGN_MINOR = 399500;
export const TRANSFER_USD_MINOR = 499;
export const TRANSFER_SKU = 'obi_ism_device_transfer';
const paystackApi = env => String(env.PAYSTACK_API_BASE || 'https://api.paystack.co').replace(/\/+$/, '');
const randomId = () => 'tpay_' + Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
const validOrder = value => /^tpay_[a-f0-9]{32}$/.test(value || '');
const result = (status,body) => ({ status, body });
const ensured = new WeakSet();

export async function ensureTransferPayments(env) {
 const db=env.OBI_DB;if(ensured.has(db))return;
 await db.prepare("CREATE TABLE IF NOT EXISTS transfer_payments (id TEXT PRIMARY KEY,challenge_id TEXT UNIQUE NOT NULL,account_id TEXT NOT NULL,checkout_session_id TEXT NOT NULL,old_device_hash TEXT NOT NULL,new_device_hash TEXT NOT NULL,provider TEXT NOT NULL,currency TEXT NOT NULL,amount_minor INTEGER NOT NULL,receipt_email TEXT NOT NULL,provider_session_id TEXT,checkout_url TEXT,status TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,apply_token TEXT)").run();
 await db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS transfer_payments_one_open ON transfer_payments(checkout_session_id) WHERE status IN ('pending','paid')").run();
 ensured.add(db);
}
export async function transferQuote(env) {
 const enabled=await isFeatureEnabled(env,'paystack_processing_charge');
 return { NGN:paystackQuote(TRANSFER_NGN_MINOR,1,enabled), USD:{currency:'USD',subtotal_minor:TRANSFER_USD_MINOR,fee_minor:0,total_minor:TRANSFER_USD_MINOR} };
}
export async function startTransferPayment(env,request,account,challenge,body,origin) {
 await ensureTransferPayments(env);
 const currency=String(body.currency||'').toUpperCase(), email=String(body.receipt_email||'').trim().toLowerCase();
 if(!['NGN','USD'].includes(currency))return result(400,{error:'Choose naira or dollars for the transfer.'});
 if(!/^\S+@\S+\.\S+$/.test(email)||/@phone\.obiism\.local$/i.test(email))return result(400,{error:'Enter a valid email for your payment receipt.'});
 const quote=(await transferQuote(env))[currency];
 if(!Number.isSafeInteger(body.quoted_total_minor)||body.quoted_total_minor!==quote.total_minor)return result(409,{error:'The transfer total changed. Request a new code and review the amount.',code:'price_changed'});
 const provider=currency==='NGN'?'paystack':'stripe',key=provider==='paystack'?env.PAYSTACK_SECRET_KEY:env.OBI_STRIPE_SECRET_KEY;
 if(!key?.startsWith('sk_'))return result(503,{error:'This payment method is not configured.'});
 const existing=await env.OBI_DB.prepare("SELECT * FROM transfer_payments WHERE checkout_session_id=? AND status IN ('pending','paid')").bind(challenge.checkout_session_id).first();
 if(existing){
  if(existing.account_id!==account.id||existing.new_device_hash!==challenge.new_device_hash)return result(409,{error:'Another transfer payment is in progress. Contact support before trying again.'});
  if(existing.currency!==currency||existing.amount_minor!==quote.total_minor||existing.receipt_email!==email)return result(409,{error:'A payment with different details is already in progress. Contact support before paying again.',orderId:existing.id});
  if(existing.status==='paid')return result(200,{paymentRequired:true,alreadyPaid:true,orderId:existing.id});
  return existing.checkout_url ? result(200,{paymentRequired:true,orderId:existing.id,url:existing.checkout_url,currency:existing.currency,total_minor:existing.amount_minor}) : result(409,{error:'A transfer payment is being prepared. Please contact support before paying again.',orderId:existing.id});
 }
 const id=randomId(),now=new Date().toISOString();
 try{
  await env.OBI_DB.prepare("INSERT INTO transfer_payments(id,challenge_id,account_id,checkout_session_id,old_device_hash,new_device_hash,provider,currency,amount_minor,receipt_email,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,'pending',?,?)").bind(id,challenge.id,account.id,challenge.checkout_session_id,challenge.old_device_hash,challenge.new_device_hash,provider,currency,quote.total_minor,email,now,now).run();
 }catch(e){if(/unique/i.test(String(e)))return result(409,{error:'Another transfer payment is already in progress. Please retry or contact support.'});throw e}
 const callback=origin+'/reader?session_id='+encodeURIComponent(challenge.checkout_session_id)+'&transfer_order='+encodeURIComponent(id);
 let response,payload;
 try{
  if(provider==='paystack'){
   response=await fetch(paystackApi(env)+'/transaction/initialize',{method:'POST',headers:{authorization:'Bearer '+key,'content-type':'application/json'},body:JSON.stringify({email,amount:quote.total_minor,currency:'NGN',reference:id,callback_url:callback,metadata:{product_sku:TRANSFER_SKU,transfer_order_id:id}})});
  }else{
   const form=new URLSearchParams({mode:'payment',customer_email:email,success_url:callback,cancel_url:callback+'&transfer_cancelled=1','automatic_tax[enabled]':'false','metadata[product_sku]':TRANSFER_SKU,'metadata[transfer_order_id]':id,'line_items[0][quantity]':'1','line_items[0][price_data][currency]':'usd','line_items[0][price_data][unit_amount]':String(quote.total_minor),'line_items[0][price_data][product_data][name]':'OBI-ISM device transfer'});
   response=await fetch('https://api.stripe.com/v1/checkout/sessions',{method:'POST',headers:{authorization:'Bearer '+key,'content-type':'application/x-www-form-urlencoded','idempotency-key':id},body:form});
  }
  payload=await response.json();
 }catch{return result(503,{error:'The transfer payment could not be prepared. Contact support before paying again.',orderId:id})}
 const url=provider==='paystack'?payload?.data?.authorization_url:payload?.url;
 const providerSession=provider==='paystack'?id:payload?.id;
 let validUrl=false;try{const parsed=new URL(url);validUrl=parsed.protocol==='https:'&&parsed.hostname===(provider==='paystack'?'checkout.paystack.com':'checkout.stripe.com')}catch{}
 if(!response.ok||!validUrl||(provider==='paystack'&&!payload?.status)||(provider==='stripe'&&!/^cs_(test|live)_[A-Za-z0-9_]+$/.test(providerSession||'')))return result(502,{error:'The transfer payment could not be prepared. Contact support before paying again.',orderId:id});
 await env.OBI_DB.prepare("UPDATE transfer_payments SET checkout_url=?,provider_session_id=?,updated_at=? WHERE id=? AND status='pending'").bind(url,providerSession,new Date().toISOString(),id).run();
 return result(200,{paymentRequired:true,orderId:id,url,currency,total_minor:quote.total_minor});
}
export async function verifyTransferPayment(env,order) {
 const key=order.provider==='paystack'?env.PAYSTACK_SECRET_KEY:env.OBI_STRIPE_SECRET_KEY;
 if(!key?.startsWith('sk_'))return result(503,{error:'Payment verification is unavailable. Please retry later.'});
 let response,data;
 try{
  const endpoint=order.provider==='paystack'?paystackApi(env)+'/transaction/verify/'+encodeURIComponent(order.id):'https://api.stripe.com/v1/checkout/sessions/'+encodeURIComponent(order.provider_session_id);
  response=await fetch(endpoint,{headers:{authorization:'Bearer '+key}});data=await response.json();
 }catch{return result(503,{error:'Payment confirmation is temporarily unavailable. Please retry.'})}
 if(!response.ok)return result(503,{error:'Payment confirmation is temporarily unavailable. Please retry.'});
 if(order.provider==='paystack'){
  const tx=data?.data;if(!data?.status||!tx)return result(503,{error:'Payment confirmation is unavailable. Please retry.'});
  if(tx.status!=='success')return result(409,{error:'Payment has not been confirmed yet. Please retry.',pending:true});
  if(tx.reference!==order.id||tx.domain!==(key.startsWith('sk_live_')?'live':'test')||String(tx.currency).toUpperCase()!=='NGN'||Number(tx.amount)!==order.amount_minor||String(tx.customer?.email||'').toLowerCase()!==order.receipt_email||tx.metadata?.product_sku!==TRANSFER_SKU||tx.metadata?.transfer_order_id!==order.id)return result(409,{error:'Payment details do not match this transfer. Contact support.'});
 }else{
  if(data.status!=='complete'||data.payment_status!=='paid')return result(409,{error:'Payment has not been confirmed yet. Please retry.',pending:true});
  if(data.id!==order.provider_session_id||Boolean(data.livemode)!==key.startsWith('sk_live_')||String(data.currency).toUpperCase()!=='USD'||Number(data.amount_total)!==order.amount_minor||data.metadata?.product_sku!==TRANSFER_SKU||data.metadata?.transfer_order_id!==order.id||String(data.customer_details?.email||data.customer_email||'').toLowerCase()!==order.receipt_email)return result(409,{error:'Payment details do not match this transfer. Contact support.'});
 }
 await env.OBI_DB.prepare("UPDATE transfer_payments SET status='paid',updated_at=? WHERE id=? AND status='pending'").bind(new Date().toISOString(),order.id).run();
 return result(200,{paid:true});
}
export { validOrder };