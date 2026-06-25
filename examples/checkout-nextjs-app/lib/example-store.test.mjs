import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { SQLiteCheckoutStore } from "./example-store.js";

function withStore(fn) {
  const dir = mkdtempSync(join(tmpdir(), "webirr-checkout-js-"));
  const dbPath = join(dir, "checkout.sqlite3");
  const store = new SQLiteCheckoutStore(dbPath);
  try {
    fn(store);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("SQLiteCheckoutStore", () => {
  it("creates a payable row and returns the standard checkout fields", () => {
    withStore((store) => {
      const order = store.createOrder("audio-book-001", "Elias");
      const payable = store.loadPayable(order.merchantReference);
      const row = store.loadRow(order.merchantReference);

      assert.equal(payable.merchantReference, order.merchantReference);
      assert.equal(payable.customerName, "Elias");
      assert.equal(payable.amount, "640.00");
      assert.equal(payable.description, "Modern Business Audio Book - Digital audio book purchase");
      assert.equal(row.item_id, "audio-book-001");
      assert.equal(row.webirr_payment_status, 0);
      assert.equal(row.webirr_payment_code, "");
    });
  });

  it("persists and recovers the payment code for the same merchant reference", () => {
    withStore((store) => {
      const order = store.createOrder("audio-book-002", "Elias");
      store.savePaymentCode(order.merchantReference, "451 728 230");

      const payable = store.loadPayable(order.merchantReference);
      const row = store.loadRow(order.merchantReference);

      assert.equal(payable.webirrPaymentCode, "451 728 230");
      assert.equal(row.webirr_payment_code, "451 728 230");
      assert.equal(row.webirr_payment_status, 0);
    });
  });

  it("marks paid with WeBirr payment reference and paid-via fields", () => {
    withStore((store) => {
      const order = store.createOrder("audio-book-003", "Elias");
      store.savePaymentCode(order.merchantReference, "451 728 231");
      store.markPaid(order.merchantReference, {
        paymentCode: "451 728 231",
        paymentStatus: 2,
        paymentReference: "TX9f7eli77683004b489b9e99",
        paymentIssuer: "CBE Mobile",
        paidAt: "2026-06-24 10:30"
      });

      const row = store.loadRow(order.merchantReference);
      assert.equal(row.webirr_payment_status, 2);
      assert.equal(row.webirr_payment_reference, "TX9f7eli77683004b489b9e99");
      assert.equal(row.webirr_paid_via, "CBE Mobile");
      assert.equal(row.paid_at, "2026-06-24 10:30");
      const receipt = store.loadReceipt(order.merchantReference);
      assert.equal(receipt.itemTitle, "Practical Finance Basics");
      assert.match(store.receiptText(order.merchantReference), /Digital Audio Book Purchase Receipt/);
    });
  });

  it("keeps status 3 reversal/cancel readiness explicit", () => {
    withStore((store) => {
      const order = store.createOrder("audio-book-004", "Elias");
      store.markReversed(order.merchantReference);

      const row = store.loadRow(order.merchantReference);
      assert.equal(row.webirr_payment_status, 3);
      assert.ok(row.reversed_at);
    });
  });

  it("requires customer name before creating a demo order", () => {
    withStore((store) => {
      assert.throws(() => store.createOrder("audio-book-001", ""), /Customer name is required/);
    });
  });
});
