# @webirr/checkout-core

Core merchant-backend checkout state machine for WeBirr online checkout.

This package creates, resumes, recovers, updates, and checks WeBirr bills
through merchant-owned server code. It does not run in the browser.

The gateway client must implement `getSupportedBanks()` with
`GET /einvoice/api/banks`. `createCheckout()` includes `supportedBanks` in the
safe checkout view model and generates instruction steps only from that
merchant-scoped list.
