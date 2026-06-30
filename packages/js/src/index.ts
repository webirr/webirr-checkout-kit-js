import {
  CheckoutInstructions,
  CheckoutStatusResult,
  CheckoutViewModel,
  SupportedBank
} from "@webirr/checkout-core";

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface WebirrCheckoutDropInOptions {
  merchantReference: string;
  createUrl: string;
  statusUrl: string;
  successUrl?: string;
  cancelUrl?: string;
  instructions?: CheckoutInstructions;
  pollIntervalMs?: number;
  fetch?: FetchLike;
  autoStart?: boolean;
  showStartButton?: boolean;
  onStatus?: (status: CheckoutStatusResult) => void;
  onError?: (error: Error) => void;
}

export interface WebirrCheckoutController {
  start(): Promise<void>;
  refresh(): Promise<void>;
  destroy(): void;
}

export async function requestCheckout(
  options: Pick<WebirrCheckoutDropInOptions, "merchantReference" | "createUrl" | "fetch">
): Promise<CheckoutViewModel> {
  const fetcher = options.fetch || fetch;
  const response = await fetcher(options.createUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      merchantReference: options.merchantReference
    })
  });
  return await readJsonResponse<CheckoutViewModel>(response);
}

export async function requestCheckoutStatus(
  options: Pick<WebirrCheckoutDropInOptions, "merchantReference" | "statusUrl" | "fetch">
): Promise<CheckoutStatusResult> {
  const fetcher = options.fetch || fetch;
  const response = await fetcher(buildStatusUrl(options.statusUrl, options.merchantReference));
  return await readJsonResponse<CheckoutStatusResult>(response);
}

export function buildStatusUrl(statusUrl: string, merchantReference: string): string {
  const url = new URL(statusUrl, window.location.href);
  url.searchParams.set("merchantReference", merchantReference);
  return url.toString();
}

export function buildReceiptUrl(
  receiptUrl: string,
  status: CheckoutStatusResult,
  checkout?: CheckoutViewModel | null
): string {
  const url = new URL(receiptUrl, window.location.href);
  const customerName = status.customerName || checkout?.customerName;
  const amount = status.amount || checkout?.amount;
  const currency = status.currency || checkout?.currency;

  url.searchParams.set("merchantReference", status.merchantReference);
  if (customerName) {
    url.searchParams.set("customerName", customerName);
  }
  if (amount) {
    url.searchParams.set("amount", amount);
  }
  if (currency) {
    url.searchParams.set("currency", currency);
  }
  if (status.paymentReference) {
    url.searchParams.set("paymentReference", status.paymentReference);
  }
  if (status.paymentIssuer) {
    url.searchParams.set("paymentIssuer", status.paymentIssuer);
  }
  if (status.paidAt) {
    url.searchParams.set("paidAt", status.paidAt);
  }
  return url.toString();
}

export function mountWebirrCheckout(
  container: string | HTMLElement,
  options: WebirrCheckoutDropInOptions
): WebirrCheckoutController {
  const root = typeof container === "string" ? document.querySelector<HTMLElement>(container) : container;
  if (!root) {
    throw new Error("WeBirr checkout container was not found.");
  }
  const rootElement = root;

  let checkout: CheckoutViewModel | null = null;
  let pollTimer: number | null = null;
  let refreshInFlight = false;
  let destroyed = false;

  async function start(): Promise<void> {
    try {
      renderLoading(rootElement);
      checkout = await requestCheckout(options);
      renderCheckout(rootElement, checkout, refresh);
      startPolling();
    } catch (error) {
      handleError(error);
    }
  }

  async function refresh(): Promise<void> {
    if (destroyed || refreshInFlight) {
      return;
    }
    refreshInFlight = true;
    try {
      const status = await requestCheckoutStatus(options);
      if (destroyed) {
        return;
      }
      options.onStatus?.(status);
      if (status.status === "Paid") {
        stopPolling();
        renderPaid(rootElement, status, checkout);
        const redirectUrl = status.receiptUrl || options.successUrl || checkout?.successUrl;
        if (redirectUrl) {
          window.location.href = buildReceiptUrl(redirectUrl, status, checkout);
        }
      } else {
        renderPending(rootElement, checkout, refresh);
      }
    } catch (error) {
      handleError(error);
    } finally {
      refreshInFlight = false;
    }
  }

  function startPolling(): void {
    stopPolling();
    const interval = options.pollIntervalMs || checkout?.pollIntervalMs || 3000;
    pollTimer = window.setInterval(() => {
      void refresh();
    }, interval);
  }

  function stopPolling(): void {
    if (pollTimer) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function handleError(error: unknown): void {
    const normalized = error instanceof Error ? error : new Error(String(error));
    options.onError?.(normalized);
    renderError(rootElement, normalized, refresh, checkout?.instructions || startInstructions(options));
  }

  function destroy(): void {
    destroyed = true;
    stopPolling();
    rootElement.innerHTML = "";
  }

  renderStart(rootElement, start, options);
  if (options.autoStart) {
    void start();
  }

  return {
    async start() {
      if (!destroyed) {
        await start();
      }
    },
    async refresh() {
      if (!destroyed) {
        await refresh();
      }
    },
    destroy
  };
}

const DEFAULT_INSTRUCTIONS: CheckoutInstructions = {
  title: "Payment Instruction",
  steps: []
};

async function readJsonResponse<T>(response: Response): Promise<T> {
  const body = await response.json() as T & { error?: string };
  if (!response.ok || body.error) {
    throw new Error(body.error || `HTTP ${response.status}`);
  }
  return body;
}

function renderStart(root: HTMLElement, start: () => Promise<void>, options: WebirrCheckoutDropInOptions): void {
  const showStartButton = options.showStartButton !== false;
  root.innerHTML = `
    <div class="webirr-checkout" data-webirr-state="ready">
      ${renderStatus("info", "Review the checkout details and continue when ready.", false)}
      ${renderInstructions(startInstructions(options))}
      ${showStartButton ? `
        <div class="webirr-button-row">
          <button type="button" class="webirr-primary-button" data-webirr-start>Checkout</button>
          ${options.cancelUrl ? `<a href="${escapeHtml(options.cancelUrl)}" class="webirr-secondary-button" data-webirr-cancel>Cancel</a>` : ""}
        </div>
      ` : ""}
    </div>
  `;
  root.querySelector<HTMLButtonElement>("[data-webirr-start]")?.addEventListener("click", () => {
    void start();
  });
}

function renderLoading(root: HTMLElement): void {
  root.innerHTML = `
    <div class="webirr-checkout" data-webirr-state="loading">
      ${renderStatus("info", "Creating payment code...", true)}
      ${renderInstructions(DEFAULT_INSTRUCTIONS)}
    </div>
  `;
}

function renderCheckout(root: HTMLElement, checkout: CheckoutViewModel, refresh: () => Promise<void>): void {
  const amount = formatAmount(checkout.amount, checkout.currency);
  root.innerHTML = `
    <div class="webirr-checkout" data-webirr-state="pending">
      <div class="payment-code-title">WeBirr Payment Code</div>
      <div class="payment-code-large" data-webirr-payment-code>${escapeHtml(checkout.paymentCode)}</div>
      ${renderStatus("info", "Waiting for payment confirmation...", true)}
      ${renderInstructions(instructionsFromSupportedBanks(checkout.supportedBanks, checkout.instructions.title))}
      <dl class="webirr-record">
        ${checkout.customerName ? `<dt>Customer</dt><dd>${escapeHtml(checkout.customerName)}</dd>` : ""}
        ${amount ? `<dt>Amount</dt><dd>${escapeHtml(amount)}</dd>` : ""}
        <dt>Merchant reference</dt>
        <dd>${escapeHtml(checkout.merchantReference)}</dd>
        <dt>Payment Status</dt>
        <dd>pending</dd>
      </dl>
    </div>
  `;
  root.querySelector<HTMLButtonElement>("[data-webirr-refresh]")?.addEventListener("click", () => {
    void refresh();
  });
}

function renderPending(
  root: HTMLElement,
  checkout: CheckoutViewModel | null,
  refresh: () => Promise<void>
): void {
  if (checkout) {
    renderCheckout(root, checkout, refresh);
  }
}

function renderPaid(root: HTMLElement, status: CheckoutStatusResult, checkout: CheckoutViewModel | null): void {
  const customerName = status.customerName || checkout?.customerName;
  const amount = formatAmount(status.amount || checkout?.amount, status.currency || checkout?.currency);

  root.innerHTML = `
    <div class="webirr-checkout" data-webirr-state="paid">
      ${renderStatus("success", "Your payment was successful.", false)}
      <div class="webirr-payment-confirmed">
        <div class="webirr-confirmation-icon" aria-hidden="true">✓</div>
        <div>
          <h2>Payment Confirmed</h2>
          <dl class="webirr-record">
            ${customerName ? `<dt>Customer</dt><dd>${escapeHtml(customerName)}</dd>` : ""}
            ${amount ? `<dt>Amount</dt><dd>${escapeHtml(amount)}</dd>` : ""}
            ${status.paymentReference ? `<dt>Payment Reference</dt><dd>${escapeHtml(status.paymentReference)}</dd>` : ""}
            ${status.paymentIssuer ? `<dt>Paid Via</dt><dd>${escapeHtml(status.paymentIssuer)}</dd>` : ""}
          </dl>
        </div>
      </div>
    </div>
  `;
}

function renderError(
  root: HTMLElement,
  error: Error,
  refresh: () => Promise<void>,
  instructions: CheckoutInstructions
): void {
  root.innerHTML = `
    <div class="webirr-checkout" data-webirr-state="error">
      ${renderStatus("danger", error.message, false)}
      ${renderInstructions(instructions)}
      <div class="payment-actions">
        <button type="button" class="webirr-primary-button" data-webirr-refresh>Refresh</button>
      </div>
    </div>
  `;
  root.querySelector<HTMLButtonElement>("[data-webirr-refresh]")?.addEventListener("click", () => {
    void refresh();
  });
}

function renderStatus(type: "info" | "warning" | "success" | "danger", message: string, spinning: boolean): string {
  return `
    <div class="webirr-status webirr-status-${type}">
      <span class="payment-spinner${spinning ? " is-visible" : ""}" aria-hidden="true"></span>
      <span class="payment-status-text">${escapeHtml(message)}</span>
    </div>
  `;
}

function renderInstructions(instructions: CheckoutInstructions): string {
  const steps = instructions.steps || [];
  return `
    <div class="payment-instruction-list">
      <div class="payment-instruction-title">${escapeHtml(instructions.title || "Payment Instruction")}</div>
      ${steps.length > 0
        ? steps.map(renderInstructionStep).join("")
        : '<div class="payment-instruction-item payment-instruction-fallback">Payment instructions will appear for this merchant&apos;s supported banks.</div>'}
    </div>
  `;
}

function startInstructions(options: WebirrCheckoutDropInOptions): CheckoutInstructions {
  return {
    title: options.instructions?.title || DEFAULT_INSTRUCTIONS.title,
    steps: []
  };
}

function instructionsFromSupportedBanks(banks: SupportedBank[] | undefined, title?: string): CheckoutInstructions {
  return {
    title: title || DEFAULT_INSTRUCTIONS.title,
    steps: (banks || []).map((bank) => `${bank.name} -> WeBirr -> Payment Code`)
  };
}

function renderInstructionStep(step: string): string {
  const parts = step.split("->").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return `
      <div class="payment-instruction-item">
        ${parts.map((part, index) => `
          <span class="${index === 0 ? "payment-instruction-channel" : "payment-instruction-target"}">${escapeHtml(part)}</span>
          ${index < parts.length - 1 ? '<span class="payment-instruction-arrow">-&gt;</span>' : ""}
        `).join("")}
      </div>
    `;
  }
  return `<div class="payment-instruction-item">${escapeHtml(step)}</div>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatAmount(amount: string | undefined, currency: string | undefined): string {
  if (!amount) {
    return "";
  }
  return currency ? `${amount} ${currency}` : amount;
}
