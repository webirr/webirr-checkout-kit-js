export default function SuccessPage() {
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
                <dt>Payment Reference</dt>
                <dd>Verified by merchant backend</dd>
                <dt>Paid Via</dt>
                <dd>WeBirr</dd>
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
