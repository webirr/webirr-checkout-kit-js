export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type PayableStatus = "Pending" | "Paid" | "Failed" | "Unknown";

export interface ApiResponse<T = unknown> {
  error?: string | null;
  errorCode?: string | number | null;
  res?: T | null;
}

export interface MerchantPayable {
  merchantReference: string;
  amount: string | number;
  currency?: "ETB" | string;
  customerName?: string;
  customerCode?: string;
  customerPhone?: string;
  description?: string;
  billTime?: string;
  successUrl?: string;
  cancelUrl?: string;
  webirrPaymentCode?: string;
  webirrPaymentStatus?: string | number;
}

export interface CheckoutContext {
  request?: unknown;
  user?: unknown;
  [key: string]: unknown;
}

export interface WeBirrBillRequest {
  amount: string | number;
  customerCode: string;
  customerName: string;
  customerPhone: string;
  time: string;
  description: string;
  billReference: string;
  extras: Record<string, JsonValue>;
}

export interface WeBirrBillResponse {
  amount?: string | number;
  customerCode?: string;
  customerName?: string;
  customerPhone?: string;
  description?: string;
  billReference?: string;
  wbcCode?: string;
  wbc_code?: string;
  paymentCode?: string;
  paymentStatus?: number;
  updateTimeStamp?: string;
  [key: string]: unknown;
}

export interface WeBirrPaymentDetail {
  paymentReference?: string;
  paymentDate?: string;
  time?: string;
  bankID?: string;
  amount?: string | number;
  wbcCode?: string;
  updateTimeStamp?: string;
  [key: string]: unknown;
}

export interface WeBirrPaymentStatus {
  status?: number;
  isPaid?: boolean;
  data?: WeBirrPaymentDetail | null;
  [key: string]: unknown;
}

export interface SupportedBank {
  bankID: string;
  name: string;
  [key: string]: unknown;
}

export interface WeBirrGatewayClient {
  createBill(bill: WeBirrBillRequest): Promise<ApiResponse<string>>;
  updateBill(bill: WeBirrBillRequest): Promise<ApiResponse<string>>;
  getPaymentStatus(paymentCode: string): Promise<ApiResponse<WeBirrPaymentStatus>>;
  getBillByReference(merchantReference: string): Promise<ApiResponse<WeBirrBillResponse>>;
  getBillByPaymentCode(paymentCode: string): Promise<ApiResponse<WeBirrBillResponse>>;
  getSupportedBanks(): Promise<ApiResponse<SupportedBank[]>>;
}

export interface WeBirrPaymentResult {
  paymentCode: string;
  paymentStatus: number;
  paymentReference?: string;
  paymentIssuer?: string;
  paidAt?: string;
  raw?: unknown;
}

export interface WeBirrCheckoutCallbacks {
  loadPayable(
    merchantReference: string,
    context: CheckoutContext
  ): Promise<MerchantPayable & {
    webirrPaymentCode?: string;
    webirrPaymentStatus?: string | number;
  }>;

  savePaymentCode(
    merchantReference: string,
    paymentCode: string,
    context: CheckoutContext
  ): Promise<void>;

  markPaid(
    merchantReference: string,
    payment: WeBirrPaymentResult,
    context: CheckoutContext
  ): Promise<void>;
}

export interface CheckoutInstructions {
  title?: string;
  steps?: string[];
}

export interface WeBirrCheckoutOptions {
  gateway: WeBirrGatewayClient;
  callbacks: WeBirrCheckoutCallbacks;
  pollIntervalMs?: number;
  instructions?: CheckoutInstructions;
  now?: () => Date;
}

export interface CreateCheckoutInput {
  merchantReference: string;
  context?: CheckoutContext;
}

export interface CheckoutViewModel {
  merchantReference: string;
  paymentCode: string;
  amount: string;
  currency: string;
  description: string;
  customerName?: string;
  customerCode?: string;
  customerPhone?: string;
  status: PayableStatus;
  paymentStatus?: number;
  pollIntervalMs: number;
  successUrl?: string;
  cancelUrl?: string;
  instructions: CheckoutInstructions;
  supportedBanks: SupportedBank[];
}

export interface CheckoutStatusInput {
  merchantReference: string;
  context?: CheckoutContext;
}

export interface CheckoutStatusResult {
  merchantReference: string;
  paymentCode?: string;
  status: PayableStatus;
  paymentStatus?: number;
  paymentReference?: string;
  paymentIssuer?: string;
  paidAt?: string;
  receiptUrl?: string;
}

export interface WeBirrCheckout {
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutViewModel>;
  getStatus(input: CheckoutStatusInput): Promise<CheckoutStatusResult>;
}

const DEFAULT_POLL_INTERVAL_MS = 3000;
const DEFAULT_INSTRUCTIONS: CheckoutInstructions = {
  title: "Payment Instruction",
  steps: []
};

export function createWeBirrCheckout(options: WeBirrCheckoutOptions): WeBirrCheckout {
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const instructions = options.instructions ?? DEFAULT_INSTRUCTIONS;
  const now = options.now ?? (() => new Date());
  const completedPayments = new Set<string>();

  async function createCheckout(input: CreateCheckoutInput): Promise<CheckoutViewModel> {
    const merchantReference = requireMerchantReference(input.merchantReference);
    const context = input.context ?? {};
    const payable = await options.callbacks.loadPayable(merchantReference, context);
    const billRequest = toBillRequest(payable, now);
    const supportedBanks = await getSupportedBanksSafe(options.gateway);
    const checkoutInstructions = instructionsForSupportedBanks(instructions, supportedBanks);

    let paymentCode = cleanPaymentCode(payable.webirrPaymentCode);
    let paymentStatus = parsePaymentStatus(payable.webirrPaymentStatus);

    if (!paymentCode) {
      const recoveredBill = await recoverBill(options.gateway, merchantReference);
      if (recoveredBill) {
        paymentCode = extractPaymentCode(recoveredBill);
        paymentStatus = parsePaymentStatus(recoveredBill.paymentStatus);
        if (paymentCode) {
          await options.callbacks.savePaymentCode(merchantReference, paymentCode, context);
        }
      }
    }

    if (!paymentCode) {
      const created = await options.gateway.createBill(billRequest);
      assertNoGatewayError(created, "create bill");
      paymentCode = cleanPaymentCode(created.res);
      if (!paymentCode) {
        throw new Error("WeBirr did not return a payment code.");
      }
      await options.callbacks.savePaymentCode(merchantReference, paymentCode, context);
    } else {
      const status = await options.gateway.getPaymentStatus(paymentCode);
      if (!status.error && status.res) {
        paymentStatus = parsePaymentStatus(status.res.status);
        if (isPaid(status.res)) {
          await markPaidOnce(completedPayments, options.callbacks, merchantReference, paymentCode, status.res, context);
          return toViewModel(payable, paymentCode, 2, "Paid", pollIntervalMs, checkoutInstructions, supportedBanks);
        }
      }

      const existingBill = await options.gateway.getBillByPaymentCode(paymentCode);
      if (!existingBill.error && existingBill.res) {
        paymentStatus = parsePaymentStatus(existingBill.res.paymentStatus) ?? paymentStatus;
        if (!isPaidBill(existingBill.res) && billChanged(existingBill.res, billRequest)) {
          const updated = await options.gateway.updateBill(billRequest);
          assertNoGatewayError(updated, "update bill");
        }
      }
    }

    return toViewModel(
      payable,
      paymentCode,
      paymentStatus,
      paymentStatus === 2 ? "Paid" : "Pending",
      pollIntervalMs,
      checkoutInstructions,
      supportedBanks
    );
  }

  async function getStatus(input: CheckoutStatusInput): Promise<CheckoutStatusResult> {
    const merchantReference = requireMerchantReference(input.merchantReference);
    const context = input.context ?? {};
    const payable = await options.callbacks.loadPayable(merchantReference, context);
    const paymentCode = cleanPaymentCode(payable.webirrPaymentCode);

    if (!paymentCode) {
      return {
        merchantReference,
        status: "Unknown"
      };
    }

    const status = await options.gateway.getPaymentStatus(paymentCode);
    assertNoGatewayError(status, "get payment status");

    const paymentStatus = parsePaymentStatus(status.res?.status);
    if (status.res && isPaid(status.res)) {
      const payment = await markPaidOnce(completedPayments, options.callbacks, merchantReference, paymentCode, status.res, context);
      return {
        merchantReference,
        paymentCode,
        status: "Paid",
        paymentStatus: 2,
        paymentReference: payment.paymentReference,
        paymentIssuer: payment.paymentIssuer,
        paidAt: payment.paidAt,
        receiptUrl: payable.successUrl
      };
    }

    return {
      merchantReference,
      paymentCode,
      status: paymentStatus === undefined ? "Unknown" : "Pending",
      paymentStatus
    };
  }

  return {
    createCheckout,
    getStatus
  };
}

function requireMerchantReference(value: string): string {
  const merchantReference = value?.trim();
  if (!merchantReference) {
    throw new Error("merchantReference is required.");
  }
  return merchantReference;
}

function toBillRequest(payable: MerchantPayable, now: () => Date): WeBirrBillRequest {
  return {
    amount: payable.amount,
    customerCode: payable.customerCode || payable.customerPhone || payable.merchantReference,
    customerName: payable.customerName || payable.customerCode || payable.merchantReference,
    customerPhone: payable.customerPhone || "",
    time: payable.billTime || formatBillTime(now()),
    description: payable.description || `Payment for ${payable.merchantReference}`,
    billReference: payable.merchantReference,
    extras: {}
  };
}

function formatBillTime(value: Date): string {
  const yyyy = value.getFullYear();
  const mm = `${value.getMonth() + 1}`.padStart(2, "0");
  const dd = `${value.getDate()}`.padStart(2, "0");
  const hh = `${value.getHours()}`.padStart(2, "0");
  const mi = `${value.getMinutes()}`.padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

async function recoverBill(
  gateway: WeBirrGatewayClient,
  merchantReference: string
): Promise<WeBirrBillResponse | null> {
  const response = await gateway.getBillByReference(merchantReference);
  if (response.error || !response.res) {
    return null;
  }
  return response.res;
}

async function getSupportedBanksSafe(gateway: WeBirrGatewayClient): Promise<SupportedBank[]> {
  const response = await gateway.getSupportedBanks();
  if (response.error || !Array.isArray(response.res)) {
    return [];
  }

  return response.res
    .map(normalizeSupportedBank)
    .filter((bank): bank is SupportedBank => bank !== null);
}

function normalizeSupportedBank(value: unknown): SupportedBank | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const bankID = comparable(record.bankID ?? record.bankid);
  const name = comparable(record.name ?? record.bankName);
  if (!bankID || !name) {
    return null;
  }

  return {
    ...record,
    bankID,
    name
  };
}

function instructionsForSupportedBanks(
  baseInstructions: CheckoutInstructions,
  supportedBanks: SupportedBank[]
): CheckoutInstructions {
  return {
    title: baseInstructions.title || DEFAULT_INSTRUCTIONS.title,
    steps: supportedBanks.map((bank) => `${bank.name} -> WeBirr -> Payment Code`)
  };
}

function cleanPaymentCode(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function extractPaymentCode(bill: WeBirrBillResponse): string | undefined {
  return cleanPaymentCode(bill.wbcCode) || cleanPaymentCode(bill.wbc_code) || cleanPaymentCode(bill.paymentCode);
}

function parsePaymentStatus(value: unknown): number | undefined {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

function isPaid(status: WeBirrPaymentStatus): boolean {
  return status.isPaid === true || parsePaymentStatus(status.status) === 2;
}

function isPaidBill(bill: WeBirrBillResponse): boolean {
  return parsePaymentStatus(bill.paymentStatus) === 2;
}

function billChanged(existing: WeBirrBillResponse, next: WeBirrBillRequest): boolean {
  return (
    comparable(existing.amount) !== comparable(next.amount) ||
    comparable(existing.customerCode) !== comparable(next.customerCode) ||
    comparable(existing.customerName) !== comparable(next.customerName) ||
    comparable(existing.customerPhone) !== comparable(next.customerPhone) ||
    comparable(existing.description) !== comparable(next.description)
  );
}

function comparable(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function assertNoGatewayError(response: ApiResponse<unknown>, action: string): void {
  if (response.error) {
    throw new Error(`Could not ${action}: ${response.error}`);
  }
}

async function markPaidOnce(
  completedPayments: Set<string>,
  callbacks: WeBirrCheckoutCallbacks,
  merchantReference: string,
  paymentCode: string,
  status: WeBirrPaymentStatus,
  context: CheckoutContext
): Promise<WeBirrPaymentResult> {
  const payment = toPaymentResult(paymentCode, status);
  const key = `${merchantReference}\u0000${paymentCode}`;
  if (completedPayments.has(key)) {
    return payment;
  }

  completedPayments.add(key);
  try {
    await callbacks.markPaid(merchantReference, payment, context);
  } catch (error) {
    completedPayments.delete(key);
    throw error;
  }
  return payment;
}

function toPaymentResult(paymentCode: string, status: WeBirrPaymentStatus): WeBirrPaymentResult {
  return {
    paymentCode,
    paymentStatus: 2,
    paymentReference: status.data?.paymentReference,
    paymentIssuer: status.data?.bankID,
    paidAt: status.data?.paymentDate || status.data?.time,
    raw: status
  };
}

function toViewModel(
  payable: MerchantPayable,
  paymentCode: string,
  paymentStatus: number | undefined,
  status: PayableStatus,
  pollIntervalMs: number,
  instructions: CheckoutInstructions,
  supportedBanks: SupportedBank[]
): CheckoutViewModel {
  return {
    merchantReference: payable.merchantReference,
    paymentCode,
    amount: String(payable.amount),
    currency: payable.currency || "ETB",
    description: payable.description || `Payment for ${payable.merchantReference}`,
    customerName: payable.customerName,
    customerCode: payable.customerCode,
    customerPhone: payable.customerPhone,
    status,
    paymentStatus,
    pollIntervalMs,
    successUrl: payable.successUrl,
    cancelUrl: payable.cancelUrl,
    instructions,
    supportedBanks
  };
}
