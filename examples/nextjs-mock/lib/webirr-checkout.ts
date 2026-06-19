import {
  ApiResponse,
  createWeBirrCheckout,
  MerchantPayable,
  WeBirrBillRequest,
  WeBirrBillResponse,
  WeBirrGatewayClient,
  WeBirrPaymentStatus,
  SupportedBank
} from "@webirr/checkout-core";
import { createCheckoutPostHandler, createCheckoutStatusGetHandler } from "@webirr/checkout-next";
import type {
  ApiResponse as SdkApiResponse,
  Bill as SdkBill,
  BillResponse as SdkBillResponse,
  PaymentStatus as SdkPaymentStatus,
  SupportedBank as SdkSupportedBank,
  WeBirrClient as SdkWeBirrClient
} from "webirr";

const webirrSdk = require("webirr") as typeof import("webirr");

type StoredPayable = MerchantPayable & {
  paid?: boolean;
  pollCount?: number;
};

const payables = new Map<string, StoredPayable>();

function resolveExamplePayable(merchantReference: string): StoredPayable {
  const existing = payables.get(merchantReference);
  if (existing) {
    return existing;
  }

  const payable: StoredPayable = {
    merchantReference,
    amount: "250.00",
    currency: "ETB",
    customerName: "Test Customer",
    customerCode: "CUST-1001",
    customerPhone: "0911000000",
    description: `Order ${merchantReference}`,
    billTime: "2026-06-18 10:00",
    successUrl: "/success",
    cancelUrl: "/"
  };
  payables.set(merchantReference, payable);
  return payable;
}

class MockGateway implements WeBirrGatewayClient {
  private billsByReference = new Map<string, WeBirrBillResponse>();
  private billsByPaymentCode = new Map<string, WeBirrBillResponse>();

  async createBill(bill: WeBirrBillRequest): Promise<ApiResponse<string>> {
    const paymentCode = "WEBIRR-123-456";
    const stored = {
      ...bill,
      wbcCode: paymentCode,
      paymentStatus: 0
    };
    this.billsByReference.set(bill.billReference, stored);
    this.billsByPaymentCode.set(paymentCode, stored);
    return { error: null, res: paymentCode, errorCode: null };
  }

  async updateBill(bill: WeBirrBillRequest): Promise<ApiResponse<string>> {
    const existing = this.billsByReference.get(bill.billReference);
    const paymentCode = existing?.wbcCode || "WEBIRR-123-456";
    const stored = {
      ...existing,
      ...bill,
      wbcCode: paymentCode,
      paymentStatus: 0
    };
    this.billsByReference.set(bill.billReference, stored);
    this.billsByPaymentCode.set(paymentCode, stored);
    return { error: null, res: "OK", errorCode: null };
  }

  async getPaymentStatus(paymentCode: string): Promise<ApiResponse<WeBirrPaymentStatus>> {
    const bill = this.billsByPaymentCode.get(paymentCode);
    const payable = bill?.billReference ? resolveExamplePayable(bill.billReference) : undefined;
    if (!payable) {
      return { error: "not found", res: null, errorCode: "NOT_FOUND" };
    }

    payable.pollCount = (payable.pollCount || 0) + 1;
    if (payable.pollCount >= 3 || payable.paid) {
      payable.paid = true;
      return {
        error: null,
        res: {
          status: 2,
          data: {
            paymentReference: "MOCK-BANK-REF",
            bankID: "mock-bank",
            paymentDate: "2026-06-18 10:05",
            wbcCode: paymentCode
          }
        },
        errorCode: null
      };
    }
    return { error: null, res: { status: 0 }, errorCode: null };
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
    return {
      error: null,
      res: [
        { bankID: "cbe_mobile", name: "CBE Mobile Banking" },
        { bankID: "telebirr", name: "Telebirr" }
      ],
      errorCode: null
    };
  }
}

class LiveWeBirrGateway implements WeBirrGatewayClient {
  private readonly client: SdkWeBirrClient;

  constructor(merchantId: string, apiKey: string) {
    this.client = new webirrSdk.WeBirrClient(merchantId, apiKey, true);
  }

  async createBill(bill: WeBirrBillRequest): Promise<ApiResponse<string>> {
    return await this.client.createBill(bill as SdkBill) as SdkApiResponse<string>;
  }

  async updateBill(bill: WeBirrBillRequest): Promise<ApiResponse<string>> {
    return await this.client.updateBill(bill as SdkBill) as SdkApiResponse<string>;
  }

  async getPaymentStatus(paymentCode: string): Promise<ApiResponse<WeBirrPaymentStatus>> {
    return await this.client.getPaymentStatus(paymentCode) as SdkApiResponse<SdkPaymentStatus>;
  }

  async getBillByReference(reference: string): Promise<ApiResponse<WeBirrBillResponse>> {
    return await this.client.getBillByReference(reference) as SdkApiResponse<SdkBillResponse>;
  }

  async getBillByPaymentCode(paymentCode: string): Promise<ApiResponse<WeBirrBillResponse>> {
    return await this.client.getBillByPaymentCode(paymentCode) as SdkApiResponse<SdkBillResponse>;
  }

  async getSupportedBanks(): Promise<ApiResponse<SupportedBank[]>> {
    return await this.client.getSupportedBanks() as SdkApiResponse<SdkSupportedBank[]>;
  }
}

function createGateway(): WeBirrGatewayClient {
  if (process.env.WEBIRR_CHECKOUT_MODE !== "live") {
    return new MockGateway();
  }

  const merchantId = process.env.WEBIRR_TEST_ENV_MERCHANT_ID || process.env.WEBIRR_MERCHANT_ID;
  const apiKey = process.env.WEBIRR_TEST_ENV_API_KEY || process.env.WEBIRR_API_KEY;

  if (!merchantId || !apiKey) {
    throw new Error("Live WeBirr TestEnv mode requires WEBIRR_TEST_ENV_MERCHANT_ID and WEBIRR_TEST_ENV_API_KEY.");
  }

  return new LiveWeBirrGateway(merchantId, apiKey);
}

const checkout = createWeBirrCheckout({
  gateway: createGateway(),
  instructions: {
    title: "Payment Instruction"
  },
  callbacks: {
    async loadPayable(merchantReference) {
      return resolveExamplePayable(merchantReference);
    },
    async savePaymentCode(merchantReference, paymentCode) {
      const payable = resolveExamplePayable(merchantReference);
      payable.webirrPaymentCode = paymentCode;
    },
    async markPaid(merchantReference, paymentResult) {
      const payable = resolveExamplePayable(merchantReference);
      payable.paid = true;
      payable.webirrPaymentStatus = paymentResult.paymentStatus;
    }
  }
});

export const POST = createCheckoutPostHandler({ checkout });
export const GET = createCheckoutStatusGetHandler({ checkout });
