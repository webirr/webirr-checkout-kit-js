# @webirr/checkout-next

Next.js route helpers for WeBirr online checkout.

The handlers call `@webirr/checkout-core` and return safe customer-facing JSON
from merchant-owned API routes.

The create handler returns `supportedBanks` from checkout core so the browser
can display only banks enabled for that merchant.
