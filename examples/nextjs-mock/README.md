# WeBirr Checkout Kit Next.js Example

This example demonstrates the checkout kit with a Moodle-inspired WeBirr
checkout screen. Mock mode is the default and does not require live WeBirr
credentials.

The browser uses `@webirr/checkout-js` and calls only merchant-owned Next.js
routes:

- `POST /api/webirr/checkout`
- `GET /api/webirr/checkout/status?merchantReference=ORDER-1001`

The server routes use `@webirr/checkout-next`, backed by
`@webirr/checkout-core`. In mock mode, a local mocked gateway returns pending
for the first polls, then returns paid. The mocked and live gateways also return
merchant-supported banks, and the browser renders payment instructions only
from that returned list.

## Mock Mode

Run locally without credentials:

```bash
npm install
npm run build
npm --workspace examples/nextjs-mock run dev
```

## Live TestEnv Mode

Live mode uses the existing `webirr` SDK on the server route only. It reads
merchant credentials from server-side environment variables and never exposes
them to the browser.

```bash
WEBIRR_CHECKOUT_MODE=live \
WEBIRR_TEST_ENV_MERCHANT_ID=replace-with-testenv-merchant-id \
WEBIRR_TEST_ENV_API_KEY=replace-with-testenv-api-key \
NEXT_PUBLIC_WEBIRR_EXAMPLE_REFERENCE=ORDER-1001 \
npm --workspace examples/nextjs-mock run dev
```

Use a fresh `NEXT_PUBLIC_WEBIRR_EXAMPLE_REFERENCE` when you want to create a new
TestEnv bill instead of resuming the existing bill for the same merchant
reference. Complete the payment through the internal WeBirr TestEnv payment
simulator supplied for testing.

For browser testing, you can also pass a fresh reference at runtime:

```text
http://localhost:3000/?merchantReference=NEXTJS-LIVE-20260618000000
```

This example does not use browser-side WeBirr credentials and does not call
WeBirr merchant APIs from the browser.
