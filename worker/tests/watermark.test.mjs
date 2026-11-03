import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeWatermark, decodeWatermarks } from '../api/src/watermark.js';

test('invisible watermark round-trips a purchase reference', () => {
  const payload = 'obi_hv98ua82gekyodyib05ydmw6';
  const text = `A paragraph of licensed text.${encodeWatermark(payload)} Next paragraph.`;
  assert.deepEqual(decodeWatermarks(text), [payload]);
});

test('watermark decoding tolerates surrounding copied text', () => {
  const payload = 'cs_live_b102O2a4wCwxF7p4sBEAhIuMIjLW7RnqnHsJzcdUDOnQMiGBLctYI9kErT';
  const text = `Pasted into a document.${encodeWatermark(payload)} And more text.`;
  assert.deepEqual(decodeWatermarks(text), [payload]);
});

test('watermark decoding returns nothing when no marker exists', () => {
  assert.deepEqual(decodeWatermarks('Ordinary copied text.'), []);
});
