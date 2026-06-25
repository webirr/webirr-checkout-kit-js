const { randomBytes } = require("node:crypto");

const demoBooks = [
  { id: "audio-book-001", title: "Modern Business Audio Book", description: "Digital audio book purchase", amount: "640.00", currency: "ETB" },
  { id: "audio-book-002", title: "Leadership Field Notes", description: "Digital audio book purchase", amount: "580.00", currency: "ETB" },
  { id: "audio-book-003", title: "Practical Finance Basics", description: "Digital audio book purchase", amount: "720.00", currency: "ETB" },
  { id: "audio-book-004", title: "Startup Operations Guide", description: "Digital audio book purchase", amount: "690.00", currency: "ETB" },
  { id: "audio-book-005", title: "Customer Service Playbook", description: "Digital audio book purchase", amount: "510.00", currency: "ETB" },
  { id: "audio-book-006", title: "Digital Commerce Lessons", description: "Digital audio book purchase", amount: "760.00", currency: "ETB" },
  { id: "audio-book-007", title: "Project Delivery Habits", description: "Digital audio book purchase", amount: "550.00", currency: "ETB" },
  { id: "audio-book-008", title: "Retail Growth Stories", description: "Digital audio book purchase", amount: "615.00", currency: "ETB" },
  { id: "audio-book-009", title: "Resilient Teams", description: "Digital audio book purchase", amount: "675.00", currency: "ETB" },
  { id: "audio-book-010", title: "Merchant Payments 101", description: "Digital audio book purchase", amount: "705.00", currency: "ETB" }
];

function findBook(bookId) {
  return demoBooks.find((book) => book.id === bookId) || null;
}

function newMerchantReference() {
  return `ord_${randomBytes(4).toString("hex")}`;
}

module.exports = {
  demoBooks,
  findBook,
  newMerchantReference
};
