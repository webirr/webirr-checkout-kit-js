# WeBirr Checkout Next.js App Example

![WeBirr Checkout Kit online checkout flow](screenshots/webirr-checkout-kit-online-checkout-journey.png)

This is a runnable Next.js web app that demonstrates the merchant-owned WeBirr
online checkout pattern.

The app shows:

- a checkout review panel;
- a checkout panel that displays the WeBirr Payment Code;
- merchant-owned create and status endpoints;
- SQLite-backed retry and recovery state;
- mock mode for local UI checks;
- optional WeBirr TestEnv or ProdEnv mode.

The browser uses `@webirr/checkout-js` and calls only merchant-owned Next.js
routes:

| Route | Purpose |
| --- | --- |
| `POST /api/webirr/checkout` | Create or resume the WeBirr payment code. |
| `GET /api/webirr/checkout/status?merchantReference=...` | Poll status and complete the local payable when paid. |

The server routes use `@webirr/checkout-next`, backed by
`@webirr/checkout-core`. Mock mode uses a local mocked gateway. TestEnv and
ProdEnv modes use the WeBirr SDK from the server route. All modes return
merchant-supported banks, and the browser renders payment instructions only from
that returned list.

## Run

Mock mode needs no WeBirr credentials:

```bash
npm install
npm run build
npm --workspace examples/checkout-nextjs-app run dev
```

Open:

```text
http://localhost:3000
```

The example creates a local SQLite database named
`webirr-checkout-demo.sqlite3`. It is ignored by Git.

## TestEnv Mode

TestEnv mode uses WeBirr merchant credentials from server-side environment
variables and never exposes them to the browser:

```bash
WEBIRR_MERCHANT_ID=replace-with-testenv-merchant-id \
WEBIRR_API_KEY=replace-with-testenv-api-key \
WEBIRR_TEST_MODE=true \
NEXT_PUBLIC_WEBIRR_EXAMPLE_REFERENCE=ord_2026_06_24_10033 \
npm --workspace examples/checkout-nextjs-app run dev
```

Use a fresh `NEXT_PUBLIC_WEBIRR_EXAMPLE_REFERENCE` when you want to create a new
TestEnv bill instead of resuming the existing bill for the same merchant
reference.

## ProdEnv Mode

ProdEnv mode is for merchant production deployments of the checkout kit. It uses
production credentials only on the server side:

```bash
WEBIRR_MERCHANT_ID=replace-with-production-merchant-id \
WEBIRR_API_KEY=replace-with-production-api-key \
WEBIRR_TEST_MODE=false \
NEXT_PUBLIC_WEBIRR_EXAMPLE_REFERENCE=ord_2026_06_24_10033 \
npm --workspace examples/checkout-nextjs-app run dev
```

Do not use production credentials for screenshots, local demos, or CI smoke
checks. Use mock mode or TestEnv mode for those cases.

## Demo Values

Optional local demo values:

```bash
NEXT_PUBLIC_WEBIRR_EXAMPLE_REFERENCE=ord_2026_06_24_10033
WEBIRR_DEMO_AMOUNT=745.50
WEBIRR_DEMO_DESCRIPTION="Sample Audio Book"
WEBIRR_DEMO_CUSTOMER_NAME=Elias
WEBIRR_DEMO_SQLITE_PATH=webirr-checkout-demo.sqlite3
```

For browser testing, you can also pass a fresh reference at runtime:

```text
http://localhost:3000/?merchantReference=ord_2026_06_24_10034
```

## Docker Compose

The example directory includes a Docker Compose file for running the checkout
against WeBirr TestEnv by default when merchant credentials are supplied:

```bash
WEBIRR_MERCHANT_ID=replace-with-testenv-merchant-id \
WEBIRR_API_KEY=replace-with-testenv-api-key \
WEBIRR_TEST_MODE=true \
docker compose up
```

The app will be available at `http://localhost:3100` by default. Use
`WEBIRR_TEST_MODE=true` or `WEBIRR_TEST_MODE=false` to choose TestEnv or
ProdEnv, `WEBIRR_CHECKOUT_EXAMPLE_PORT` to choose another local port, and
optionally use `NEXT_PUBLIC_WEBIRR_EXAMPLE_REFERENCE` when you need a specific
merchant reference for repeatable screenshots or recovery testing. If
`WEBIRR_MERCHANT_ID` and `WEBIRR_API_KEY` are omitted, the example falls back to
mock mode.

This example does not use browser-side WeBirr credentials and does not call
WeBirr merchant APIs from the browser.

## SQLite Store

The example stores checkout/payment state in SQLite:

```text
id
merchant_reference
customer_name
amount
description
webirr_payment_code
webirr_payment_status
webirr_payment_reference
webirr_paid_via
created_at
updated_at
paid_at
reversed_at
```

`merchant_reference` is the merchant-owned durable key. Platform-specific data
such as cart items, booking details, course IDs, shipping addresses, or tax rows
should stay in the merchant application's own tables.

## Status Values

Use the WeBirr status model:

```text
0 pending/not paid
1 paid-unconfirmed/in progress
2 paid
3 reversed/canceled
```

## Screenshot Notes

The journey screenshot shows the same three-step flow used in the WooCommerce,
Moodle, and Go checkout examples: checkout review, payment-code waiting, and
payment confirmation.

The payment-code and paid-success states in the journey screenshot were
captured against WeBirr TestEnv, so the payment code and payment reference use
real gateway formats.

Supporting screenshot files are kept under `screenshots/` for detailed review:
checkout review, payment-code waiting, paid confirmation, and error/manual
refresh.

## Validate

From the repository root:

```bash
npm test
npm run test:example
npm run build:example
```
