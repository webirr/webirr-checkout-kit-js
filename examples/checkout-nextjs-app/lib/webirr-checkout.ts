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
import { sharedExampleStore } from "./example-store";
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
  webirrPaymentCode?: string;
  webirrPaymentStatus?: string | number;
};

function resolveExamplePayable(merchantReference: string): StoredPayable {
  return exampleStore().loadPayable(merchantReference) as StoredPayable;
}

function exampleStore() {
  return sharedExampleStore();
}

class MockGateway implements WeBirrGatewayClient {
  private billsByReference = new Map<string, WeBirrBillResponse>();
  private billsByPaymentCode = new Map<string, WeBirrBillResponse>();
  private statusCallsByPaymentCode = new Map<string, number>();

  async createBill(bill: WeBirrBillRequest): Promise<ApiResponse<string>> {
    if (bill.billReference.includes("ERROR")) {
      return { error: "merchant denied checkout", res: null, errorCode: "DEMO_DENIED" };
    }

    const paymentCode = mockPaymentCode(bill.billReference);
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
    if (!bill?.billReference) {
      return { error: "not found", res: null, errorCode: "NOT_FOUND" };
    }

    const pollCount = (this.statusCallsByPaymentCode.get(paymentCode) || 0) + 1;
    this.statusCallsByPaymentCode.set(paymentCode, pollCount);
    if (pollCount >= 3) {
      return {
        error: null,
        res: {
          status: 2,
          data: {
            paymentReference: "TX9f7eli77683004b489b9e99",
            bankName: "CBE Mobile",
            paymentDate: "2026-06-24 10:30",
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
        { bankID: "cbe_mobile", name: "CBE Mobile" },
        { bankID: "cbe_birr", name: "CBE Birr" },
        { bankID: "awash_birr", name: "Awash Birr" },
        { bankID: "telebirr", name: "Telebirr" },
        { bankID: "m_pesa", name: "M-Pesa" },
        { bankID: "coopay_ebirr", name: "Coopay Ebirr" }
      ],
      errorCode: null
    };
  }
}

class LiveWeBirrGateway implements WeBirrGatewayClient {
  private readonly client: SdkWeBirrClient;

  constructor(merchantId: string, apiKey: string, isTestEnv: boolean) {
    this.client = new webirrSdk.WeBirrClient(merchantId, apiKey, isTestEnv);
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
  const merchantId = firstEnv("WEBIRR_MERCHANT_ID");
  const apiKey = firstEnv("WEBIRR_API_KEY");
  if (!merchantId && !apiKey) {
    return new MockGateway();
  }

  if (!merchantId || !apiKey) {
    throw new Error("Real WeBirr gateway mode requires WEBIRR_MERCHANT_ID and WEBIRR_API_KEY.");
  }

  const isTestEnv = envBoolDefault("WEBIRR_TEST_MODE", true);
  return new LiveWeBirrGateway(merchantId, apiKey, isTestEnv);
}

function envBoolDefault(name: string, defaultValue: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) {
    return defaultValue;
  }
  if (["1", "true", "yes", "y", "on"].includes(value)) {
    return true;
  }
  if (["0", "false", "no", "n", "off"].includes(value)) {
    return false;
  }
  throw new Error(`${name} must be true or false.`);
}

function firstEnv(name: string): string {
  return process.env[name]?.trim() || "";
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
      exampleStore().savePaymentCode(merchantReference, paymentCode);
    },
    async markPaid(merchantReference, paymentResult) {
      exampleStore().markPaid(merchantReference, paymentResult);
    }
  }
});

export const POST = createCheckoutPostHandler({ checkout });
export const GET = createCheckoutStatusGetHandler({ checkout });

function mockPaymentCode(merchantReference: string): string {
  let hash = 0;
  for (const char of merchantReference) {
    hash = (hash * 31 + char.charCodeAt(0)) % 900000000;
  }
  const digits = String(100000000 + hash).slice(0, 9);
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}
