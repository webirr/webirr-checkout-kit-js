"use client";

import { mountWebirrCheckout, WebirrCheckoutController } from "@webirr/checkout-js";
import { useEffect, useRef, useState } from "react";

const defaultMerchantReference = process.env.NEXT_PUBLIC_WEBIRR_EXAMPLE_REFERENCE || "ORDER-1001";

export default function CheckoutWidget() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<WebirrCheckoutController | null>(null);
  const [merchantReference, setMerchantReference] = useState(defaultMerchantReference);
  const [started, setStarted] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    const requestedReference = new URLSearchParams(window.location.search).get("merchantReference")?.trim();
    if (requestedReference && requestedReference !== merchantReference) {
      setMerchantReference(requestedReference);
      setStarted(false);
      setStarting(false);
    }
  }, [merchantReference]);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    controllerRef.current = mountWebirrCheckout(containerRef.current, {
      merchantReference,
      createUrl: "/api/webirr/checkout",
      statusUrl: "/api/webirr/checkout/status",
      successUrl: "/success",
      cancelUrl: "/",
      pollIntervalMs: 1200,
      showStartButton: false,
      instructions: {
        title: "Payment Instruction"
      },
      onError() {
        setStarting(false);
      }
    });

    return () => {
      controllerRef.current?.destroy();
    };
  }, [merchantReference]);

  async function handleStart() {
    setStarted(true);
    setStarting(true);
    await controllerRef.current?.start();
    setStarting(false);
  }

  return (
    <main className="webirr-checkout-shell">
      <div className="webirr-topbar">
        <div className="webirr-brand">
          <img src="/webirr-cute-logo.png" alt="WeBirr" className="webirr-brand-logo" />
          <h1>WeBirr Online Checkout</h1>
        </div>
      </div>

      <div className="webirr-layout">
        <section className="webirr-panel">
          <div className="webirr-panel-title">Checkout</div>
          <dl className="webirr-summary">
            <dt>Customer</dt>
            <dd>Test Customer</dd>
            <dt>Amount</dt>
            <dd>250.00 ETB</dd>
            <dt>Description</dt>
            <dd>Order {merchantReference}</dd>
          </dl>
          <div className="webirr-button-row">
            <button
              type="button"
              className="webirr-primary-button"
              disabled={started || starting}
              onClick={() => void handleStart()}
            >
              Checkout
            </button>
            <a href="/" className="webirr-secondary-button">Cancel</a>
          </div>
        </section>

        <section className="webirr-panel" ref={containerRef} />
      </div>
    </main>
  );
}
