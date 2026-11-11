// Customer-facing surcharge, in kobo. 1.5% of the edition subtotal plus
// N100 when the resulting transaction reaches N2500, capped at N2000.
// Paystack calculates its own fee on the final transaction, which can differ.
export function paystackQuote(unitMinor, quantity = 1) {
  if (!Number.isSafeInteger(unitMinor) || unitMinor < 1 || !Number.isInteger(quantity) || quantity < 1 || quantity > 10000) throw new Error('Invalid quote');
  const subtotalMinor = unitMinor * quantity;
  if (!Number.isSafeInteger(subtotalMinor)) throw new Error('Invalid quote');
  const percentageMinor = Math.round(subtotalMinor * 3 / 200);
  const flatMinor = subtotalMinor + percentageMinor < 250000 ? 0 : 10000;
  const feeMinor = Math.min(200000, percentageMinor + flatMinor);
  return { currency:'NGN', quantity, unit_minor:unitMinor, subtotal_minor:subtotalMinor, fee_minor:feeMinor, total_minor:subtotalMinor+feeMinor };
}
