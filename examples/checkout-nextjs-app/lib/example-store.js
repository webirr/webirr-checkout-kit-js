const { DatabaseSync } = loadNodeSQLite();
const fs = require("node:fs");
const path = require("node:path");
const { findBook, newMerchantReference } = require("./catalog.js");

let sharedStore;

function openExampleStore(dbPath = sqlitePath()) {
  return new SQLiteCheckoutStore(dbPath);
}

function sharedExampleStore() {
  if (!sharedStore) {
    sharedStore = openExampleStore();
  }
  return sharedStore;
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
  demo_type TEXT NOT NULL DEFAULT 'audiobook',
  item_id TEXT NOT NULL DEFAULT '',
  item_title TEXT NOT NULL DEFAULT '',
  customer_name TEXT NOT NULL,
  amount TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ETB',
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
    for (const [name, definition] of [
      ["demo_type", "TEXT NOT NULL DEFAULT 'audiobook'"],
      ["item_id", "TEXT NOT NULL DEFAULT ''"],
      ["item_title", "TEXT NOT NULL DEFAULT ''"],
      ["currency", "TEXT NOT NULL DEFAULT 'ETB'"]
    ]) {
      this.ensureColumn(name, definition);
    }
  }

  loadPayable(merchantReference) {
    const row = this.loadRow(merchantReference);
    if (!row) {
      throw new Error(`payable ${merchantReference} was not found`);
    }
    return rowToPayable(row);
  }

  createOrder(bookId, customerName) {
    const book = findBook(bookId);
    const normalizedCustomer = firstNonEmpty(customerName);
    if (!book) {
      throw new Error("Choose a valid audio book.");
    }
    if (!normalizedCustomer) {
      throw new Error("Customer name is required.");
    }

    const merchantReference = newMerchantReference();
    const now = nowText();
    this.db.prepare(`
INSERT INTO webirr_checkouts (
  merchant_reference, demo_type, item_id, item_title, customer_name, amount,
  currency, description, created_at, updated_at
) VALUES (?, 'audiobook', ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
      merchantReference,
      book.id,
      book.title,
      normalizedCustomer,
      book.amount,
      book.currency,
      book.description,
      now,
      now
    );

    return rowToOrder(this.loadRow(merchantReference));
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
       demo_type, item_id, item_title, currency, webirr_payment_code,
       webirr_payment_status, webirr_payment_reference, webirr_paid_via,
       created_at, updated_at, paid_at, reversed_at
FROM webirr_checkouts
WHERE merchant_reference = ?
`).get(merchantReference);
  }

  loadReceipt(merchantReference) {
    const row = this.loadRow(merchantReference);
    if (!row || row.webirr_payment_status !== 2) {
      throw new Error(`paid order ${merchantReference} was not found`);
    }
    return rowToReceipt(row);
  }

  receiptText(merchantReference) {
    const receipt = this.loadReceipt(merchantReference);
    return [
      "WeBirr Online Checkout Demo",
      "----------------------------",
      "Digital Audio Book Purchase Receipt",
      "",
      `Customer Name: ${receipt.customerName}`,
      `Audio Book Title: ${receipt.itemTitle}`,
      `Amount: ${receipt.amount} ${receipt.currency}`,
      `Merchant Reference: ${receipt.merchantReference}`,
      `WeBirr Payment Code: ${receipt.paymentCode}`,
      `Payment Reference: ${receipt.paymentReference}`,
      `Paid Via: ${receipt.paidVia}`,
      `Paid At: ${receipt.paidAt}`,
      `Demo Download Access: ${receipt.itemTitle}`,
      ""
    ].join("\n");
  }

  ensureColumn(name, definition) {
    const columns = this.db.prepare("PRAGMA table_info(webirr_checkouts)").all();
    if (columns.some((column) => column.name === name)) {
      return;
    }
    this.db.exec(`ALTER TABLE webirr_checkouts ADD COLUMN ${name} ${definition}`);
  }
}

function rowToOrder(row) {
  if (!row) {
    return null;
  }
  return {
    merchantReference: row.merchant_reference,
    itemId: row.item_id,
    itemTitle: row.item_title,
    amount: row.amount,
    currency: row.currency || "ETB",
    customerName: row.customer_name,
    description: row.description,
    successUrl: `/success?merchantReference=${encodeURIComponent(row.merchant_reference)}`,
    cancelUrl: "/"
  };
}

function rowToPayable(row) {
  return {
    merchantReference: row.merchant_reference,
    amount: row.amount,
    currency: row.currency || "ETB",
    customerName: row.customer_name,
    customerCode: row.merchant_reference,
    customerPhone: "",
    description: `${row.item_title} - ${row.description}`,
    successUrl: `/success?merchantReference=${encodeURIComponent(row.merchant_reference)}`,
    cancelUrl: "/",
    webirrPaymentCode: row.webirr_payment_code || undefined,
    webirrPaymentStatus: row.webirr_payment_status
  };
}

function rowToReceipt(row) {
  return {
    ...rowToOrder(row),
    paymentCode: row.webirr_payment_code || "",
    paymentReference: row.webirr_payment_reference || "",
    paidVia: row.webirr_paid_via || "",
    paidAt: row.paid_at || ""
  };
}

function sqlitePath() {
  const dockerDataDir = "/app/data";
  if (fs.existsSync(dockerDataDir) && fs.statSync(dockerDataDir).isDirectory()) {
    return path.join(dockerDataDir, "webirr-checkout-demo.sqlite3");
  }
  return "webirr-checkout-demo.sqlite3";
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
  openExampleStore,
  rowToOrder,
  sharedExampleStore
};

function loadNodeSQLite() {
  return eval("require")("node:sqlite");
}
