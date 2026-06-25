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
      const payable = store.loadPayable("ord_2026_06_24_10033");
      const row = store.loadRow("ord_2026_06_24_10033");

      assert.equal(payable.merchantReference, "ord_2026_06_24_10033");
      assert.equal(payable.customerName, "Elias");
      assert.equal(payable.amount, "745.50");
      assert.equal(payable.description, "Sample Audio Book");
      assert.equal(row.webirr_payment_status, 0);
      assert.equal(row.webirr_payment_code, "");
    });
  });

  it("persists and recovers the payment code for the same merchant reference", () => {
    withStore((store) => {
      store.loadPayable("ord_2026_06_24_10034");
      store.savePaymentCode("ord_2026_06_24_10034", "451 728 230");

      const payable = store.loadPayable("ord_2026_06_24_10034");
      const row = store.loadRow("ord_2026_06_24_10034");

      assert.equal(payable.webirrPaymentCode, "451 728 230");
      assert.equal(row.webirr_payment_code, "451 728 230");
      assert.equal(row.webirr_payment_status, 0);
    });
  });

  it("marks paid with WeBirr payment reference and paid-via fields", () => {
    withStore((store) => {
      store.loadPayable("ord_2026_06_24_10035");
      store.savePaymentCode("ord_2026_06_24_10035", "451 728 231");
      store.markPaid("ord_2026_06_24_10035", {
        paymentCode: "451 728 231",
        paymentStatus: 2,
        paymentReference: "TX9f7eli77683004b489b9e99",
        paymentIssuer: "CBE Mobile",
        paidAt: "2026-06-24 10:30"
      });

      const row = store.loadRow("ord_2026_06_24_10035");
      assert.equal(row.webirr_payment_status, 2);
      assert.equal(row.webirr_payment_reference, "TX9f7eli77683004b489b9e99");
      assert.equal(row.webirr_paid_via, "CBE Mobile");
      assert.equal(row.paid_at, "2026-06-24 10:30");
    });
  });

  it("keeps status 3 reversal/cancel readiness explicit", () => {
    withStore((store) => {
      store.loadPayable("ord_2026_06_24_10036");
      store.markReversed("ord_2026_06_24_10036");

      const row = store.loadRow("ord_2026_06_24_10036");
      assert.equal(row.webirr_payment_status, 3);
      assert.ok(row.reversed_at);
    });
  });
});

