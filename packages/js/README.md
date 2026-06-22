# @webirr/checkout-js

Browser drop-in UI for WeBirr online checkout.

The drop-in renders payment instructions and polls merchant-owned endpoints. It
does not call WeBirr merchant APIs directly and does not hold merchant API
credentials.

The default UI follows the same checkout shape as the Moodle and WooCommerce
plugins: review state, payment-code display, merchant-supported payment
instructions, pending status, manual refresh on errors, and paid confirmation.
The paid state shows Customer, Amount, Payment Reference, and Paid Via when the
merchant backend returns those safe display fields. Merchants can mount the
drop-in with its built-in Checkout button or set `showStartButton: false` and
trigger `controller.start()` from their own summary panel.

Payment instructions come from the `supportedBanks` array returned by the
merchant backend create endpoint. The drop-in does not keep or display a broad
hard-coded bank list.
