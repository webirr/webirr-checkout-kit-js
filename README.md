# WeBirr Checkout Kit JS

JavaScript and TypeScript checkout kit for WeBirr online checkout integrations.

This workspace contains:

- `@webirr/checkout-core`: backend checkout state machine and WeBirr gateway contracts.
- `@webirr/checkout-next`: Next.js route-handler helpers.
- `@webirr/checkout-js`: browser checkout drop-in.
- `examples/nextjs-mock`: runnable Next.js example with mocked mode and optional WeBirr TestEnv mode.

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

The example can run without WeBirr credentials in mocked mode. Live TestEnv mode
uses `WEBIRR_TEST_ENV_MERCHANT_ID` and `WEBIRR_TEST_ENV_API_KEY` from the local
environment.
