const { DatabaseSync } = loadNodeSQLite();

function openExampleStore(dbPath = sqlitePath()) {
  return new SQLiteCheckoutStore(dbPath);
}

class SQLiteCheckoutStore {
  constructor(dbPath) {
    this.db = new DatabaseSync(dbPath);
    this.migrate();
  }

  close() {
    this.db.close();
  }

  migrate() {
    this.db.exec(`
CREATE TABLE IF NOT EXISTS webirr_checkouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  merchant_reference TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,
  amount TEXT NOT NULL,
  description TEXT NOT NULL,
  webirr_payment_code TEXT NOT NULL DEFAULT '',
  webirr_payment_status INTEGER NOT NULL DEFAULT 0,
  webirr_payment_reference TEXT NOT NULL DEFAULT '',
  webirr_paid_via TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  paid_at TEXT,
  reversed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_webirr_checkouts_status ON webirr_checkouts(webirr_payment_status);
`);
  }

  loadPayable(merchantReference) {
    this.upsertDefaultPayable(merchantReference);
    const row = this.loadRow(merchantReference);
    if (!row) {
      throw new Error(`payable ${merchantReference} was not found`);
    }
    return rowToPayable(row);
  }

  savePaymentCode(merchantReference, paymentCode) {
    const result = this.db.prepare(`
UPDATE webirr_checkouts
SET webirr_payment_code = ?, webirr_payment_status = 0, updated_at = ?
WHERE merchant_reference = ?
`).run(paymentCode, nowText(), merchantReference);
    requireUpdated(result, merchantReference);
  }

  markPaid(merchantReference, payment) {
    const paidAt = firstNonEmpty(payment.paidAt, nowText());
    const result = this.db.prepare(`
UPDATE webirr_checkouts
SET webirr_payment_code = COALESCE(NULLIF(?, ''), webirr_payment_code),
    webirr_payment_status = 2,
    webirr_payment_reference = ?,
    webirr_paid_via = ?,
    paid_at = ?,
    updated_at = ?
WHERE merchant_reference = ?
`).run(
      firstNonEmpty(payment.paymentCode),
      firstNonEmpty(payment.paymentReference),
      firstNonEmpty(payment.paymentIssuer),
      paidAt,
      nowText(),
      merchantReference
    );
    requireUpdated(result, merchantReference);
  }

  markReversed(merchantReference) {
    const result = this.db.prepare(`
UPDATE webirr_checkouts
SET webirr_payment_status = 3, reversed_at = ?, updated_at = ?
WHERE merchant_reference = ?
`).run(nowText(), nowText(), merchantReference);
    requireUpdated(result, merchantReference);
  }

  loadRow(merchantReference) {
    return this.db.prepare(`
SELECT id, merchant_reference, customer_name, amount, description,
       webirr_payment_code, webirr_payment_status, webirr_payment_reference,
       webirr_paid_via, created_at, updated_at, paid_at, reversed_at
FROM webirr_checkouts
WHERE merchant_reference = ?
`).get(merchantReference);
  }

  upsertDefaultPayable(merchantReference) {
    const now = nowText();
    const defaults = defaultPayable(merchantReference);
    this.db.prepare(`
INSERT INTO webirr_checkouts (
  merchant_reference, customer_name, amount, description, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT(merchant_reference) DO UPDATE SET
  customer_name = excluded.customer_name,
  amount = excluded.amount,
  description = excluded.description,
  updated_at = excluded.updated_at
`).run(
      defaults.merchantReference,
      defaults.customerName,
      defaults.amount,
      defaults.description,
      now,
      now
    );
  }
}

function defaultPayable(merchantReference) {
  return {
    merchantReference,
    amount: firstNonEmpty(process.env.WEBIRR_DEMO_AMOUNT, "745.50"),
    currency: "ETB",
    customerName: firstNonEmpty(process.env.WEBIRR_DEMO_CUSTOMER_NAME, "Elias"),
    customerCode: firstNonEmpty(process.env.WEBIRR_DEMO_CUSTOMER_CODE, merchantReference),
    customerPhone: "",
    description: firstNonEmpty(process.env.WEBIRR_DEMO_DESCRIPTION, "Sample Audio Book"),
    successUrl: "/success",
    cancelUrl: "/"
  };
}

function rowToPayable(row) {
  return {
    merchantReference: row.merchant_reference,
    amount: row.amount,
    currency: "ETB",
    customerName: row.customer_name,
    customerCode: row.merchant_reference,
    customerPhone: "",
    description: row.description,
    successUrl: "/success",
    cancelUrl: "/",
    webirrPaymentCode: row.webirr_payment_code || undefined,
    webirrPaymentStatus: row.webirr_payment_status
  };
}

function sqlitePath() {
  return firstNonEmpty(process.env.WEBIRR_DEMO_SQLITE_PATH, "webirr-checkout-demo.sqlite3");
}

function nowText() {
  return new Date().toISOString();
}

function requireUpdated(result, merchantReference) {
  if (!result || result.changes === 0) {
    throw new Error(`payable ${merchantReference} was not found`);
  }
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value != null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

module.exports = {
  SQLiteCheckoutStore,
  defaultPayable,
  openExampleStore
};

function loadNodeSQLite() {
  return eval("require")("node:sqlite");
}
