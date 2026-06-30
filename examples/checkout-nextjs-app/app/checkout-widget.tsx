"use client";

import { mountWebirrCheckout, WebirrCheckoutController } from "@webirr/checkout-js";
import { useEffect, useRef, useState } from "react";

type DemoBook = {
  id: string;
  title: string;
  description: string;
  amount: string;
  currency: string;
};

type DemoOrder = {
  merchantReference: string;
  itemTitle: string;
  amount: string;
  currency: string;
  customerName: string;
  description: string;
  successUrl: string;
  cancelUrl: string;
};

type CheckoutWidgetProps = {
  books: DemoBook[];
};

export default function CheckoutWidget({ books }: CheckoutWidgetProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<WebirrCheckoutController | null>(null);
  const [customerName, setCustomerName] = useState("Elias");
  const [order, setOrder] = useState<DemoOrder | null>(null);
  const [started, setStarted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!containerRef.current || !order || !started) {
      return;
    }
    const controller = mountWebirrCheckout(containerRef.current, {
      merchantReference: order.merchantReference,
      createUrl: "/api/webirr/checkout",
      statusUrl: "/api/webirr/checkout/status",
      successUrl: order.successUrl,
      cancelUrl: "/",
      pollIntervalMs: 1200,
      autoStart: true,
      showStartButton: false,
      instructions: {
        title: "Payment Instruction"
      },
      onError() {
        setStarting(false);
      }
    });
    controllerRef.current = controller;
    setStarting(false);

    return () => {
      controller.destroy();
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
    };
  }, [order, started]);

  async function handleBuy(bookId: string) {
    const normalizedCustomer = customerName.trim();
    if (!normalizedCustomer) {
      setError("Customer name is required.");
      return;
    }
    setError("");
    setStarted(false);
    setStarting(false);
    controllerRef.current?.destroy();
    controllerRef.current = null;
    const response = await fetch("/api/demo/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bookId, customerName: normalizedCustomer })
    });
    const data = await response.json();
    if (!response.ok || data.error) {
      setError(data.error || "Could not create order.");
      return;
    }
    setOrder(data as DemoOrder);
  }

  function handleStart() {
    setError("");
    setStarting(true);
    setStarted(true);
  }

  return (
    <main className="webirr-checkout-shell">
      <div className="webirr-topbar">
        <div className="webirr-brand">
          <img src="/webirr-cute-logo.png" alt="WeBirr" className="webirr-brand-logo" />
          <h1>WeBirr Online Checkout</h1>
        </div>
      </div>

      {!order ? (
        <section className="webirr-panel">
          <div className="webirr-panel-title">Audio Book Store</div>
          {error ? <div className="webirr-error">{error}</div> : null}
          <label className="webirr-field">
            <span>Customer</span>
            <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} required />
          </label>
          <div className="webirr-catalog-grid">
            {books.map((book) => (
              <article className="webirr-book-card" key={book.id}>
                <div>
                  <h2>{book.title}</h2>
                  <p>{book.description}</p>
                  <strong>{book.amount} {book.currency}</strong>
                </div>
                <button type="button" className="webirr-primary-button" onClick={() => void handleBuy(book.id)}>
                  Buy
                </button>
              </article>
            ))}
          </div>
        </section>
      ) : !started ? (
        <section className="webirr-panel">
          <div className="webirr-panel-title">Order Review</div>
          <dl className="webirr-summary">
            <dt>Customer</dt>
            <dd>{order.customerName}</dd>
            <dt>Audio book</dt>
            <dd>{order.itemTitle}</dd>
            <dt>Amount</dt>
            <dd>{order.amount} {order.currency}</dd>
            <dt>Description</dt>
            <dd>{order.description}</dd>
            <dt>Merchant reference</dt>
            <dd>{order.merchantReference}</dd>
          </dl>
          <div className="webirr-button-row">
            <button
              type="button"
              className="webirr-primary-button"
              disabled={started || starting}
              onClick={handleStart}
            >
              Pay with WeBirr
            </button>
          </div>
        </section>
      ) : (
        <section className="webirr-panel" ref={containerRef} />
      )}
    </main>
  );
}
