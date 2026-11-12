# Paystack checkout charge

The edition prices in Payment settings are the base prices. NGN Paystack checkout adds a disclosed Paystack charge to the subtotal when enabled; USD Stripe checkout does not.

- Admin > Features > Paystack processing charge switches the charge on or off. The default is on, preserving the deployed behaviour. A pending quote is rechecked at checkout; already initialized payments retain their original amounts.
- The charge is 1.5% of the edition subtotal, rounded to the nearest kobo, plus NGN 100 if the subtotal plus percentage reaches NGN 2,500. It is capped at NGN 2,000 per transaction.
- This is the operator-selected surcharge. Paystack calculates its own fees on the final amount and may apply different fees for international cards or other arrangements; the surcharge is not a guarantee of the exact provider fee or net settlement.
- The calculation applies once per transaction, including bulk quantities and approved local-test discounts. A single NGN 6,995 edition has a NGN 204.93 charge and a NGN 7,199.93 total. A standard 20-copy order has a NGN 2,000 capped charge.
- GET /api/paystack/quote returns the server quote. Public checkout submits that quote and stops if pricing changes before initialization. The UI shows the subtotal, Paystack charge, and total in a payment review after the buyer chooses to pay and before redirecting.
- Single checkout stores the full charged amount in price_minor and separately records the subtotal and charge in Paystack metadata. Bulk checkout stores the full charged amount as total_minor and the base unit price separately. Provider confirmation checks those original recorded values; changing prices does not alter in-flight orders.
- Deployment order: deploy Worker first, then publish website and admin assets immediately. Cached older Paystack pages without a quote fail closed; refresh to load the updated page. Test in Paystack test mode before relying on live payments.
