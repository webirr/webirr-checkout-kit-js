import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildReceiptUrl,
  buildStatusUrl,
  mountWebirrCheckout,
  requestCheckout,
  requestCheckoutStatus
} from "./index.js";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });
}

describe("checkout browser helpers", () => {
  it("posts only merchantReference to merchant create endpoint", async () => {
    const calls: Array<{ input: string | URL | Request; init?: RequestInit }> = [];
    const fetcher = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      calls.push({ input, init });
      return response({
        merchantReference: "ORDER-1001",
        paymentCode: "CODE-1",
        amount: "250.00",
        currency: "ETB",
        description: "Order",
        status: "Pending",
        pollIntervalMs: 3000,
        instructions: { steps: ["step"] }
      });
    };

    const checkout = await requestCheckout({
      merchantReference: "ORDER-1001",
      createUrl: "/api/webirr/checkout",
      fetch: fetcher
    });

    assert.equal(checkout.paymentCode, "CODE-1");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].input, "/api/webirr/checkout");
    assert.equal(calls[0].init?.method, "POST");
    assert.deepEqual(JSON.parse(calls[0].init?.body as string), {
      merchantReference: "ORDER-1001"
    });
  });

  it("builds status URL with merchantReference", () => {
    const originalWindow = globalThis.window;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: { href: "https://merchant.test/checkout" } }
    });

    const url = buildStatusUrl("/api/webirr/status?existing=1", "ORDER-1001");

    assert.equal(url, "https://merchant.test/api/webirr/status?existing=1&merchantReference=ORDER-1001");
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow
    });
  });

  it("builds receipt URL with payment confirmation details", () => {
    const originalWindow = globalThis.window;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: { href: "https://merchant.test/checkout" } }
    });

    const url = buildReceiptUrl("/success?existing=1", {
      merchantReference: "ORDER-1001",
      paymentCode: "CODE-1",
      status: "Paid",
      paymentStatus: 2,
      paymentReference: "TX123",
      paymentIssuer: "CBE Mobile",
      paidAt: "2026-06-19 12:00"
    });

    assert.equal(
      url,
      "https://merchant.test/success?existing=1&paymentReference=TX123&paymentIssuer=CBE+Mobile&paidAt=2026-06-19+12%3A00"
    );
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow
    });
  });

  it("polls only merchant status endpoint", async () => {
    const fetcher = async (): Promise<Response> => response({
      merchantReference: "ORDER-1001",
      paymentCode: "CODE-1",
      status: "Paid",
      paymentStatus: 2
    });
    const originalWindow = globalThis.window;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: { href: "https://merchant.test/checkout" } }
    });

    const status = await requestCheckoutStatus({
      merchantReference: "ORDER-1001",
      statusUrl: "/api/webirr/status",
      fetch: fetcher
    });

    assert.equal(status.status, "Paid");
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow
    });
  });

  it("throws merchant endpoint errors", async () => {
    await assert.rejects(
      () => requestCheckout({
        merchantReference: "ORDER-1001",
        createUrl: "/api/webirr/checkout",
        fetch: async () => response({ error: "merchant denied checkout" }, 403)
      }),
      /merchant denied checkout/
    );
  });

  it("does not overlap polling requests while status refresh is in flight", async () => {
    const originalWindow = globalThis.window;
    let intervalCallback: (() => void) | undefined;
    let statusCalls = 0;
    let resolveFirstStatus: ((response: Response) => void) | undefined;
    const root = {
      innerHTML: "",
      querySelector() {
        return null;
      }
    } as unknown as HTMLElement;

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: { href: "https://merchant.test/checkout" },
        setInterval(callback: () => void) {
          intervalCallback = callback;
          return 1;
        },
        clearInterval() {
          return undefined;
        }
      }
    });

    const controller = mountWebirrCheckout(root, {
      merchantReference: "ORDER-1001",
      createUrl: "/api/webirr/checkout",
      statusUrl: "/api/webirr/status",
      fetch: async (_input, init) => {
        if (init?.method === "POST") {
          return response({
            merchantReference: "ORDER-1001",
            paymentCode: "CODE-1",
            amount: "250.00",
            currency: "ETB",
            description: "Order",
            status: "Pending",
            pollIntervalMs: 3000,
            instructions: { steps: [] },
            supportedBanks: []
          });
        }

        statusCalls += 1;
        if (statusCalls === 1) {
          return await new Promise<Response>((resolve) => {
            resolveFirstStatus = resolve;
          });
        }
        return response({
          merchantReference: "ORDER-1001",
          paymentCode: "CODE-1",
          status: "Pending",
          paymentStatus: 0
        });
      }
    });

    await controller.start();
    assert.equal(statusCalls, 0);
    assert.ok(intervalCallback);

    intervalCallback?.();
    intervalCallback?.();
    await Promise.resolve();

    assert.equal(statusCalls, 1);
    resolveFirstStatus?.(response({
      merchantReference: "ORDER-1001",
      paymentCode: "CODE-1",
      status: "Pending",
      paymentStatus: 0
    }));
    await Promise.resolve();
    controller.destroy();

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow
    });
  });
});
