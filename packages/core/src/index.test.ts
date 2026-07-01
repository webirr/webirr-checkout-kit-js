import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ApiResponse,
  createWeBirrCheckout,
  MerchantPayable,
  WeBirrBillRequest,
  WeBirrBillResponse,
  WeBirrGatewayClient,
  WeBirrPaymentStatus,
  SupportedBank
} from "./index.js";

class FakeGateway implements WeBirrGatewayClient {
  createdBills: WeBirrBillRequest[] = [];
  updatedBills: WeBirrBillRequest[] = [];
  billsByReference = new Map<string, WeBirrBillResponse>();
  billsByPaymentCode = new Map<string, WeBirrBillResponse>();
  statuses = new Map<string, WeBirrPaymentStatus>();
  createBillError?: Error;
  createBillResponse?: ApiResponse<string>;
  supportedBanksResponse: ApiResponse<SupportedBank[]> = {
    error: null,
    res: [
      { bankID: "cbe_mobile", name: "CBE Mobile Banking" },
      { bankID: "telebirr", name: "Telebirr" }
    ],
    errorCode: null
  };

  async createBill(bill: WeBirrBillRequest): Promise<ApiResponse<string>> {
    if (this.createBillError) throw this.createBillError;
    this.createdBills.push(bill);
    if (this.createBillResponse) return this.createBillResponse;
    const code = `CODE-${this.createdBills.length}`;
    const response = {
      ...bill,
      wbcCode: code,
      paymentStatus: 0
    };
    this.billsByReference.set(bill.billReference, response);
    this.billsByPaymentCode.set(code, response);
    return { error: null, res: code, errorCode: null };
  }

  async updateBill(bill: WeBirrBillRequest): Promise<ApiResponse<string>> {
    this.updatedBills.push(bill);
    const existing = this.billsByReference.get(bill.billReference);
    const code = existing?.wbcCode || "CODE-UPDATED";
    const response = {
      ...existing,
      ...bill,
      wbcCode: code,
      paymentStatus: existing?.paymentStatus ?? 0
    };
    this.billsByReference.set(bill.billReference, response);
    this.billsByPaymentCode.set(code, response);
    return { error: null, res: "OK", errorCode: null };
  }

  async getPaymentStatus(paymentCode: string): Promise<ApiResponse<WeBirrPaymentStatus>> {
    return { error: null, res: this.statuses.get(paymentCode) || { status: 0 }, errorCode: null };
  }

  async getBillByReference(merchantReference: string): Promise<ApiResponse<WeBirrBillResponse>> {
    const bill = this.billsByReference.get(merchantReference);
    return bill ? { error: null, res: bill, errorCode: null } : { error: "not found", res: null, errorCode: "NOT_FOUND" };
  }

  async getBillByPaymentCode(paymentCode: string): Promise<ApiResponse<WeBirrBillResponse>> {
    const bill = this.billsByPaymentCode.get(paymentCode);
    return bill ? { error: null, res: bill, errorCode: null } : { error: "not found", res: null, errorCode: "NOT_FOUND" };
  }

  async getSupportedBanks(): Promise<ApiResponse<SupportedBank[]>> {
    return this.supportedBanksResponse;
  }
}

function payable(overrides: Partial<MerchantPayable> = {}): MerchantPayable {
  return {
    merchantReference: "ORDER-1001",
    amount: "250.00",
    currency: "ETB",
    customerName: "Test Customer",
    customerCode: "CUST-1",
    customerPhone: "0911000000",
    description: "Order ORDER-1001",
    billTime: "2026-06-18 10:00",
    successUrl: "/orders/ORDER-1001/receipt",
    ...overrides
  };
}

function harness(initialPayable: MerchantPayable, gateway = new FakeGateway()) {
  let currentPayable = { ...initialPayable };
  const savedCodes: string[] = [];
  const paidReferences: string[] = [];
  const checkout = createWeBirrCheckout({
    gateway,
    callbacks: {
      async loadPayable() {
        return currentPayable;
      },
      async savePaymentCode(_reference, paymentCode) {
        currentPayable = { ...currentPayable, webirrPaymentCode: paymentCode };
        savedCodes.push(paymentCode);
      },
      async markPaid(reference, payment) {
        paidReferences.push(reference);
        currentPayable = { ...currentPayable, webirrPaymentStatus: payment.paymentStatus };
      }
    },
    now: () => new Date("2026-06-18T10:00:00Z")
  });

  return {
    checkout,
    gateway,
    savedCodes,
    paidReferences,
    setPayable(next: MerchantPayable) {
      currentPayable = { ...next };
    },
    getPayable() {
      return currentPayable;
    }
  };
}

describe("createCheckout", () => {
  it("creates a new bill and saves the returned payment code", async () => {
    const h = harness(payable());

    const view = await h.checkout.createCheckout({ merchantReference: "ORDER-1001" });

    assert.equal(view.paymentCode, "CODE-1");
    assert.equal(view.status, "Pending");
    assert.deepEqual(view.supportedBanks.map((bank) => bank.bankID), ["cbe_mobile", "telebirr"]);
    assert.deepEqual(view.instructions.steps, [
      "CBE Mobile Banking -> WeBirr -> Payment Code",
      "Telebirr -> WeBirr -> Payment Code"
    ]);
    assert.equal(h.gateway.createdBills.length, 1);
    assert.equal(h.savedCodes[0], "CODE-1");
  });

  it("recovers an existing bill by merchant reference before creating a new one", async () => {
    const gateway = new FakeGateway();
    gateway.billsByReference.set("ORDER-1001", {
      billReference: "ORDER-1001",
      amount: "250.00",
      customerCode: "CUST-1",
      customerName: "Test Customer",
      customerPhone: "0911000000",
      description: "Order ORDER-1001",
      wbcCode: "RECOVERED-CODE",
      paymentStatus: 0
    });
    gateway.billsByPaymentCode.set("RECOVERED-CODE", gateway.billsByReference.get("ORDER-1001")!);
    const h = harness(payable(), gateway);

    const view = await h.checkout.createCheckout({ merchantReference: "ORDER-1001" });

    assert.equal(view.paymentCode, "RECOVERED-CODE");
    assert.equal(h.gateway.createdBills.length, 0);
    assert.equal(h.savedCodes[0], "RECOVERED-CODE");
  });

  it("reuses a stored payment code without creating a duplicate bill", async () => {
    const gateway = new FakeGateway();
    gateway.billsByPaymentCode.set("EXISTING-CODE", {
      billReference: "ORDER-1001",
      amount: "250.00",
      customerCode: "CUST-1",
      customerName: "Test Customer",
      customerPhone: "0911000000",
      description: "Order ORDER-1001",
      wbcCode: "EXISTING-CODE",
      paymentStatus: 0
    });
    const h = harness(payable({ webirrPaymentCode: "EXISTING-CODE" }), gateway);

    const view = await h.checkout.createCheckout({ merchantReference: "ORDER-1001" });

    assert.equal(view.paymentCode, "EXISTING-CODE");
    assert.equal(h.gateway.createdBills.length, 0);
    assert.equal(h.gateway.updatedBills.length, 0);
  });

  it("updates an unpaid bill when payable details changed", async () => {
    const gateway = new FakeGateway();
    gateway.billsByPaymentCode.set("EXISTING-CODE", {
      billReference: "ORDER-1001",
      amount: "200.00",
      customerCode: "CUST-1",
      customerName: "Test Customer",
      customerPhone: "0911000000",
      description: "Old description",
      wbcCode: "EXISTING-CODE",
      paymentStatus: 0
    });
    const h = harness(payable({ webirrPaymentCode: "EXISTING-CODE" }), gateway);

    const view = await h.checkout.createCheckout({ merchantReference: "ORDER-1001" });

    assert.equal(view.paymentCode, "EXISTING-CODE");
    assert.equal(h.gateway.updatedBills.length, 1);
    assert.equal(h.gateway.updatedBills[0].amount, "250.00");
  });

  it("marks the payable paid when the stored payment code is already paid", async () => {
    const gateway = new FakeGateway();
    gateway.statuses.set("PAID-CODE", {
      status: 2,
      data: {
        paymentReference: "BANK-REF",
        bankID: "bank",
        paymentDate: "2026-06-18 10:05"
      }
    });
    const h = harness(payable({ webirrPaymentCode: "PAID-CODE" }), gateway);

    const view = await h.checkout.createCheckout({ merchantReference: "ORDER-1001" });

    assert.equal(view.status, "Paid");
    assert.deepEqual(h.paidReferences, ["ORDER-1001"]);
    assert.equal(h.gateway.updatedBills.length, 0);
  });

  it("does not show bank-specific instructions when supported banks cannot be loaded", async () => {
    const gateway = new FakeGateway();
    gateway.supportedBanksResponse = { error: "banks unavailable", res: null, errorCode: "BANKS_UNAVAILABLE" };
    const h = harness(payable(), gateway);

    const view = await h.checkout.createCheckout({ merchantReference: "ORDER-1001" });

    assert.deepEqual(view.supportedBanks, []);
    assert.deepEqual(view.instructions.steps, []);
  });

  it("propagates platform errors without rewriting them as business errors", async () => {
    const gateway = new FakeGateway();
    const expected = new Error("connection reset");
    gateway.createBillError = expected;
    const h = harness(payable(), gateway);

    await assert.rejects(
      () => h.checkout.createCheckout({ merchantReference: "ORDER-1001" }),
      (error) => error === expected
    );
  });

  it("keeps WeBirr business errors on the ApiResponse path", async () => {
    const gateway = new FakeGateway();
    gateway.createBillResponse = {
      error: "invalid amount",
      errorCode: "INVALID_AMOUNT",
      res: null
    };
    const h = harness(payable(), gateway);

    await assert.rejects(
      () => h.checkout.createCheckout({ merchantReference: "ORDER-1001" }),
      /Could not create bill: invalid amount/
    );
  });
});

describe("getStatus", () => {
  it("returns pending status for an unpaid payment code", async () => {
    const h = harness(payable({ webirrPaymentCode: "PENDING-CODE" }));

    const status = await h.checkout.getStatus({ merchantReference: "ORDER-1001" });

    assert.equal(status.status, "Pending");
    assert.equal(status.paymentStatus, 0);
    assert.equal(status.customerName, "Test Customer");
    assert.equal(status.amount, "250.00");
    assert.equal(status.currency, "ETB");
  });

  it("marks paid idempotently after payment confirmation", async () => {
    const gateway = new FakeGateway();
    gateway.statuses.set("PAID-CODE", {
      status: 2,
      data: {
        paymentReference: "BANK-REF",
        bankID: "bank",
        paymentDate: "2026-06-18 10:05"
      }
    });
    const h = harness(payable({ webirrPaymentCode: "PAID-CODE" }), gateway);

    const first = await h.checkout.getStatus({ merchantReference: "ORDER-1001" });
    const second = await h.checkout.getStatus({ merchantReference: "ORDER-1001" });

    assert.equal(first.status, "Paid");
    assert.equal(second.status, "Paid");
    assert.equal(first.customerName, "Test Customer");
    assert.equal(first.amount, "250.00");
    assert.equal(first.currency, "ETB");
    assert.deepEqual(h.paidReferences, ["ORDER-1001"]);
  });
});
