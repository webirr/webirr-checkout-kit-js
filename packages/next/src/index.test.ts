import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CheckoutStatusResult, CheckoutViewModel, WeBirrCheckout } from "@webirr/checkout-core";
import {
  createCheckoutPostHandler,
  createCheckoutStatusGetHandler,
  createWebirrCheckoutHandlers
} from "./index.js";

function fakeCheckout(): WeBirrCheckout & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async createCheckout(input): Promise<CheckoutViewModel> {
      calls.push(`create:${input.merchantReference}:${input.context?.user || ""}`);
      return {
        merchantReference: input.merchantReference,
        paymentCode: "CODE-1",
        amount: "250.00",
        currency: "ETB",
        description: "Order",
        status: "Pending",
        pollIntervalMs: 3000,
        instructions: { steps: ["step"] },
        supportedBanks: []
      };
    },
    async getStatus(input): Promise<CheckoutStatusResult> {
      calls.push(`status:${input.merchantReference}:${input.context?.user || ""}`);
      return {
        merchantReference: input.merchantReference,
        paymentCode: "CODE-1",
        status: "Pending",
        paymentStatus: 0
      };
    }
  };
}

describe("Next route handlers", () => {
  it("creates checkout from POST JSON body", async () => {
    const checkout = fakeCheckout();
    const handler = createCheckoutPostHandler({
      checkout,
      resolveContext: () => ({ user: "u1" })
    });

    const response = await handler(new Request("http://merchant.test/api/webirr/checkout", {
      method: "POST",
      body: JSON.stringify({ merchantReference: "ORDER-1001" })
    }));
    const body = await response.json() as CheckoutViewModel;

    assert.equal(response.status, 200);
    assert.equal(body.paymentCode, "CODE-1");
    assert.deepEqual(checkout.calls, ["create:ORDER-1001:u1"]);
  });

  it("returns 400 when merchantReference is missing from POST", async () => {
    const response = await createCheckoutPostHandler({ checkout: fakeCheckout() })(
      new Request("http://merchant.test/api/webirr/checkout", {
        method: "POST",
        body: JSON.stringify({})
      })
    );
    const body = await response.json() as { error: string };

    assert.equal(response.status, 400);
    assert.equal(body.error, "merchantReference is required.");
  });

  it("reads status merchantReference from query string", async () => {
    const checkout = fakeCheckout();
    const handler = createCheckoutStatusGetHandler({ checkout });

    const response = await handler(new Request("http://merchant.test/api/webirr/checkout/status?merchantReference=ORDER-1001"));
    const body = await response.json() as CheckoutStatusResult;

    assert.equal(response.status, 200);
    assert.equal(body.status, "Pending");
    assert.deepEqual(checkout.calls, ["status:ORDER-1001:"]);
  });

  it("returns route handler pair", async () => {
    const handlers = createWebirrCheckoutHandlers({ checkout: fakeCheckout() });

    assert.equal(typeof handlers.POST, "function");
    assert.equal(typeof handlers.GET, "function");
  });
});
