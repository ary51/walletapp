// The starter categories a brand-new account gets, so the dashboard isn't
// completely empty on first login. Users can rename or delete any of these —
// they're just normal rows, not special in the database in any way.

const DEFAULT_CATEGORIES = [
  { name: "Paycheck", type: "income" },
  { name: "Groceries", type: "expense" },
  { name: "Rent", type: "expense" },
  { name: "Transportation", type: "expense" },
  { name: "Dining Out", type: "expense" },
  { name: "Entertainment", type: "expense" },
];

module.exports = { DEFAULT_CATEGORIES };
