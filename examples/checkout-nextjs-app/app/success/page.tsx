type SuccessPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] || "";
  }
  return value || "";
}

export default async function SuccessPage({ searchParams }: SuccessPageProps) {
  const params = searchParams ? await searchParams : {};
  const customerName = firstParam(params.customerName);
  const amount = firstParam(params.amount);
  const currency = firstParam(params.currency);
  const paymentReference = firstParam(params.paymentReference);
  const paymentIssuer = firstParam(params.paymentIssuer);
  const formattedAmount = amount ? `${amount}${currency ? ` ${currency}` : ""}` : "";

  return (
    <main className="success-shell">
      <section className="success">
        <h1>Your payment was successful.</h1>
        <div className="success-body">
          <div className="success-card">
            <div className="webirr-confirmation-icon" aria-hidden="true">✓</div>
            <div>
              <h2>Payment Confirmed</h2>
              <dl className="webirr-record">
                {customerName ? (
                  <>
                    <dt>Customer</dt>
                    <dd>{customerName}</dd>
                  </>
                ) : null}
                {formattedAmount ? (
                  <>
                    <dt>Amount</dt>
                    <dd>{formattedAmount}</dd>
                  </>
                ) : null}
                {paymentReference ? (
                  <>
                    <dt>Payment Reference</dt>
                    <dd>{paymentReference}</dd>
                  </>
                ) : null}
                {paymentIssuer ? (
                  <>
                    <dt>Paid Via</dt>
                    <dd>{paymentIssuer}</dd>
                  </>
                ) : null}
              </dl>
            </div>
          </div>
          <div className="success-actions">
            <a href="/">Continue</a>
          </div>
        </div>
      </section>
    </main>
  );
}
