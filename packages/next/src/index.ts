import {
  CheckoutContext,
  WeBirrCheckout
} from "@webirr/checkout-core";

export type ContextResolver = (request: Request) => CheckoutContext | Promise<CheckoutContext>;

export interface NextCheckoutHandlerOptions {
  checkout: WeBirrCheckout;
  resolveContext?: ContextResolver;
}

export interface NextRouteHandlers {
  POST: (request: Request) => Promise<Response>;
  GET: (request: Request) => Promise<Response>;
}

export function createWebirrCheckoutHandlers(options: NextCheckoutHandlerOptions): NextRouteHandlers {
  return {
    POST: createCheckoutPostHandler(options),
    GET: createCheckoutStatusGetHandler(options)
  };
}

export function createCheckoutPostHandler(options: NextCheckoutHandlerOptions): (request: Request) => Promise<Response> {
  return async function POST(request: Request): Promise<Response> {
    try {
      const body = await readJsonBody(request);
      const merchantReference = readMerchantReference(body);
      const context = await resolveContext(options, request);
      const checkout = await options.checkout.createCheckout({ merchantReference, context });
      return json(checkout);
    } catch (error) {
      return errorJson(error);
    }
  };
}

export function createCheckoutStatusGetHandler(options: NextCheckoutHandlerOptions): (request: Request) => Promise<Response> {
  return async function GET(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const merchantReference = readMerchantReference({
        merchantReference: url.searchParams.get("merchantReference")
      });
      const context = await resolveContext(options, request);
      const status = await options.checkout.getStatus({ merchantReference, context });
      return json(status);
    } catch (error) {
      return errorJson(error);
    }
  };
}

async function resolveContext(
  options: NextCheckoutHandlerOptions,
  request: Request
): Promise<CheckoutContext> {
  if (!options.resolveContext) {
    return { request };
  }
  return await options.resolveContext(request);
}

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.body) {
    return {};
  }
  const body = await request.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {};
  }
  return body as Record<string, unknown>;
}

function readMerchantReference(input: Record<string, unknown>): string {
  const value = input.merchantReference;
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError(400, "merchantReference is required.");
  }
  return value.trim();
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8"
    }
  });
}

function errorJson(error: unknown): Response {
  const status = error instanceof HttpError ? error.status : 500;
  const message = error instanceof Error ? error.message : "Unexpected checkout error.";
  return json({ error: message }, status);
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

