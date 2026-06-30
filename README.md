# WeBirr Checkout Kit JS

![WeBirr Checkout Kit online checkout flow](examples/checkout-nextjs-app/screenshots/webirr-checkout-kit-online-checkout-journey.png)

JavaScript and TypeScript checkout kit for WeBirr online checkout integrations.
It gives custom merchant applications the WeBirr online checkout pattern:
merchant backend creates or resumes the WeBirr bill, browser displays the
WeBirr Payment Code, browser polls only merchant-owned endpoints, and the
merchant backend completes the payable after server-side WeBirr verification.

This workspace contains:

- `@webirr/checkout-core`: backend checkout state machine and WeBirr gateway
  contracts.
- `@webirr/checkout-next`: Next.js route-handler helpers for merchant-owned API
  routes.
- `@webirr/checkout-js`: browser checkout drop-in that calls only merchant
  endpoints.
- `examples/checkout-nextjs-app`: runnable Next.js checkout web app example with
  SQLite retry/recovery state, mock mode by default, and optional WeBirr TestEnv
  and ProdEnv modes.

## How The Integration Works

The browser never calls WeBirr merchant APIs and never receives merchant API
credentials. The backend packages are responsible for loading the merchant
payable, creating or recovering the WeBirr payment code, returning
merchant-supported banks, polling payment status, and marking the payable paid
idempotently.

| Checkout role | Package or example entry point | WeBirr call |
| --- | --- | --- |
| Create or resume payment code | `@webirr/checkout-core` through a merchant backend route | Create bill, recover bill by merchant reference, update unpaid bill when needed |
| Expose Next.js routes | `@webirr/checkout-next` | Calls checkout core from merchant-owned route handlers |
| Render checkout UI | `@webirr/checkout-js` | No direct WeBirr call; posts only `merchantReference` to the merchant backend |
| Poll payment status | `@webirr/checkout-js` calling a merchant backend status route | Server-side WeBirr payment-status check |
| Complete paid payable | Merchant callback `markPaid` | Runs only after server-side paid verification |

The durable checkout key is `merchantReference`. No browser-facing checkout ID
is required for the baseline flow.

The runnable example stores local merchant checkout state in SQLite so retries
and restarts reuse the same `merchantReference -> WeBirr Payment Code` mapping.

## WeBirr Payment Flow

At a glance, the payment flow is:

### 1. Invoice Creation / Checkout On Purchase

- The customer starts a merchant checkout or invoice payment.
- The merchant backend resolves the payable amount, customer, description, and
  stable `merchantReference`.
- Checkout core creates or resumes the WeBirr bill and stores the WeBirr
  Payment Code through merchant callbacks.

### 2. Payment Code Display

- The browser drop-in displays the **WeBirr Payment Code**.
- Payment instructions are generated only from the merchant's `supportedBanks`
  response.
- The customer payment path is:
  `{Banking App} -> WeBirr menu -> Enter Payment Code -> Pay`.

### 3. Payment Status Monitoring

- Browser JavaScript polls the merchant backend status endpoint.
- The merchant backend checks WeBirr payment status from the server side.
- Manual refresh appears only when polling fails; normal polling is sequential.

### 4. Completion And Access

- Once WeBirr reports paid, the merchant backend calls `markPaid` idempotently.
- The paid UI or success page shows Customer, Amount, Payment Reference, and
  Paid Via.

### Detailed Flow

1. A customer opens the audio book catalog and enters a customer name.
2. The customer chooses an audio book with **Buy**.
3. The Next.js example backend validates the selected book, resolves amount,
   currency, customer, and description from the server-side catalog, and creates
   a local SQLite order with a stable `merchantReference`.
4. The browser shows the checkout review for that `merchantReference`.
5. When the customer starts checkout, the browser posts only the
   `merchantReference` to `POST /api/webirr/checkout`.
6. The merchant backend loads the payable from the local store, creates or
   resumes the WeBirr bill, saves the `merchantReference -> WeBirr Payment Code`
   mapping, and returns only display-safe checkout fields.
7. The browser drop-in displays the **WeBirr Payment Code**, pending status,
   merchant reference, and payment instructions generated from the merchant's
   `supportedBanks`.
8. The customer opens a mobile banking or wallet app integrated with WeBirr and
   follows: `{Banking App} -> WeBirr menu -> Enter Payment Code -> Pay`.
9. The browser polls
   `GET /api/webirr/checkout/status?merchantReference=...`. The merchant backend
   resolves status from WeBirr status polling or local payment state.
10. When paid status is verified, the merchant backend calls `markPaid`
    idempotently, stores the payment reference and paid-via value, and returns
    the paid confirmation fields.
11. The customer sees the payment confirmation and can download the demo audio
    book receipt.

## Runtime Modes

Production merchant integrations should use only real WeBirr modes on the
merchant backend:

- TestEnv: set `WEBIRR_MERCHANT_ID`, `WEBIRR_API_KEY`, and
  `WEBIRR_TEST_MODE=true` on the server.
- ProdEnv: set `WEBIRR_MERCHANT_ID`, `WEBIRR_API_KEY`, and
  `WEBIRR_TEST_MODE=false` on the server.

Mock mode exists only for the standalone Next.js example and CI-style checks.
Use TestEnv mode when screenshots need to show real WeBirr payment-code and
payment-reference formats. Mock mode should not be exposed as a production
merchant setting.

## Development

Install dependencies:

```sh
npm install
```

Run package tests:

```sh
npm test
```

Run the SQLite example store tests:

```sh
npm run test:example
```

Build the Next.js example:

```sh
npm run build:example
```

The example can run without WeBirr credentials in mock mode. Real gateway modes
use `WEBIRR_MERCHANT_ID`, `WEBIRR_API_KEY`, and `WEBIRR_TEST_MODE` from the
local server environment. Do not expose those values as browser `NEXT_PUBLIC_*`
variables.

For VPS or Dokploy deployment, use the example Compose file. It builds the local
Dockerfile, exposes port `3100`, passes only the three WeBirr gateway variables,
and stores SQLite payment state in a named volume:

```sh
cd examples/checkout-nextjs-app
docker compose up --build
```
