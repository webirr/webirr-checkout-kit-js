# WeBirr Checkout Kit JS

![WeBirr Checkout Kit online checkout flow](examples/nextjs-mock/screenshots/webirr-checkout-kit-online-checkout-journey.png)

JavaScript and TypeScript checkout kit for WeBirr online checkout integrations.
It gives custom merchant applications the same WeBirr online checkout pattern
used by the Moodle and WooCommerce plugins: merchant backend creates or resumes
the WeBirr bill, browser displays the WeBirr Payment Code, browser polls only
merchant-owned endpoints, and the merchant backend completes the payable after
server-side WeBirr verification.

This workspace contains:

- `@webirr/checkout-core`: backend checkout state machine and WeBirr gateway
  contracts.
- `@webirr/checkout-next`: Next.js route-handler helpers for merchant-owned API
  routes.
- `@webirr/checkout-js`: browser checkout drop-in that calls only merchant
  endpoints.
- `examples/nextjs-mock`: runnable Next.js example with mocked mode plus
  optional WeBirr TestEnv and ProdEnv modes.

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

## Screenshot Notes

The lead screenshot shows the same three-step flow used in the WooCommerce and
Moodle examples: checkout review, payment-code waiting, and payment
confirmation. It was captured against WeBirr TestEnv so the visible payment code
and payment reference use real gateway formats.

## Runtime Modes

Production merchant integrations should use only real WeBirr modes on the
merchant backend:

- `testenv`: reads `WEBIRR_TEST_ENV_MERCHANT_ID` and
  `WEBIRR_TEST_ENV_API_KEY` on the server.
- `prod`: reads `WEBIRR_PROD_MERCHANT_ID` and `WEBIRR_PROD_API_KEY` on the
  server.

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

Build the Next.js example:

```sh
npm run build:example
```

The example can run without WeBirr credentials in mocked mode. TestEnv mode
uses `WEBIRR_TEST_ENV_MERCHANT_ID` and `WEBIRR_TEST_ENV_API_KEY` from the local
server environment. ProdEnv mode uses `WEBIRR_PROD_MERCHANT_ID` and
`WEBIRR_PROD_API_KEY` from the server environment. Do not expose those values as
browser `NEXT_PUBLIC_*` variables.

## Release Status

This kit is not released publicly yet. Before npm release, configure trusted
publishing for `@webirr/checkout-core`, `@webirr/checkout-next`, and
`@webirr/checkout-js`, run package dry-runs, and verify clean install/import
from npm after publish.
