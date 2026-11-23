# Website analytics

Open /admin/analytics.html after signing in as an administrator, or select
Analytics in either admin sidebar. Times and reporting dates use Africa/Lagos.

The dashboard reports:
- Estimated browsers today: distinct random daily browser IDs for page views.
  These are not identified people; multiple browsers count separately, while
  cleared storage, blocked scripts, privacy signals and network failures can
  change the count.
- Page views: successful client-side measurement calls. Repeat loads count.
- Checkout attempts: a visitor clicked the edition purchase button or
  submitted the bulk checkout form. Repeated attempts are counted.
- Checkout handoffs: the client received a provider checkout URL and began
  navigating to Paystack or Stripe. This does not establish that the visitor
  paid. Use the existing Purchases view and gateway records to review outcomes.
- Page views by landing, sign-in, bulk, journal listing or individual article,
  and checkout attempts/handoffs by selected currency and purchase mode.

The endpoint only accepts enumerated events, modes, currencies and page
categories or a validated public article slug. It does not store query
strings, account email, payment identifiers, user agents or full URLs.
A browser identifier is random and rotates on the next visit each Lagos day;
it is kept in browser local storage. Do Not Track and Global Privacy Control
are respected. Verified bots and common crawler user agents are excluded.
Server analytics records older than 90 days are cleaned on subsequent event
activity. The dashboard shows the latest 30 days.

Analytics starts when deployed; it cannot reconstruct historical traffic.
Zeros before launch do not imply that nobody visited. Reports are approximate,
client events may be blocked or lost, and this is not a reconciliation system.
Local and production databases do not sync.

Deploy the new Worker before publishing the updated website assets, following
docs/DEPLOYMENT.md. Verify the admin analytics route requires sign-in and
perform a non-purchase page view in an agreed test window. Do not initiate a
real payment merely to verify telemetry.