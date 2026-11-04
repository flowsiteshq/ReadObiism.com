# Feature controls

Administrators can turn public features on or off without deploying code. The
setting is stored in D1 in `feature_flags` and enforced by the Worker.

## Current controls

| Key | Default | What it controls |
|---|---|---|
| `single_purchase` | On | New single-edition checkout sessions |
| `gift_purchase` | On | Buying an edition as a gift |
| `bulk_purchase` | On | New bulk / group orders |
| `device_transfer` | **Off** | Moving an edition to another device |
| `google_signin` | On | Google sign-in button and endpoint |
| `phone_signin` | On | Phone account registration and sign-in |
| `reader_feedback` | On | Submitting reader feedback |

`device_transfer` is deliberately off by default. Enable it from the admin
Features panel when device moves should be available again.

## Admin usage

1. Sign in at `/admin/`.
2. Open **Features**.
3. Toggle the feature.
4. The change is saved immediately. Disabled features stop accepting new
   actions; existing purchases and reading access remain intact.

## API

- `GET /api/features` returns the public feature map.
- `GET /api/admin/features` returns labels, descriptions and states.
- `POST /api/admin/features` accepts `{ "key": "device_transfer", "enabled": true }`.
  Admin session, same-origin request and JSON content type are required.

## Enforcement

- Single and gift checkout are blocked at `/api/checkout`.
- New bulk orders are blocked at `/api/bulk`; existing orders can still be
  recovered and claimed.
- Device transfer start/confirm endpoints return `503` when disabled.
- Google sign-in is blocked at `/api/account/google`.
- Phone registration/login is blocked at `/api/account/phone/*`.
- New reader feedback is blocked; existing feedback can still be read.
