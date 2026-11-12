import test from 'node:test';
import assert from 'node:assert/strict';
import { paystackQuote } from '../api/src/paystack-fees.js';

test('charges 1.5 percent of subtotal plus N100, rounded to the kobo', () => {
  assert.deepEqual(paystackQuote(699500), { currency:'NGN',quantity:1,unit_minor:699500,subtotal_minor:699500,fee_minor:20493,total_minor:719993 });
  assert.deepEqual(paystackQuote(699500,2), { currency:'NGN',quantity:2,unit_minor:699500,subtotal_minor:1399000,fee_minor:30985,total_minor:1429985 });
});
test('waives the flat fee below N2500 and caps fees at N2000 per transaction', () => {
  assert.equal(paystackQuote(100000).fee_minor,1500);
  assert.equal(paystackQuote(246305).fee_minor,13695);
  assert.equal(paystackQuote(699500,20).fee_minor,200000);
  assert.throws(()=>paystackQuote(0));
  assert.throws(()=>paystackQuote(699500,10001));
});

test('switching the fee off retains the base subtotal for single and bulk',()=>{ assert.equal(paystackQuote(699500,1,false).total_minor,699500); assert.equal(paystackQuote(699500,20,false).total_minor,13990000); });
