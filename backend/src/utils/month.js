// Accepts a month as either "YYYY-MM" (what an <input type="month"> gives you)
// or a full "YYYY-MM-DD", and normalizes it to the first-of-month date string
// the budgets table always stores (e.g. "2026-08-01"). Throws on anything else,
// so a malformed value fails loudly here instead of silently becoming a weird
// date somewhere downstream.
function normalizeMonth(input) {
  const match = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(String(input || ""));
  if (!match) {
    throw Object.assign(new Error("month must be in YYYY-MM format"), { status: 400 });
  }
  const [, year, month] = match;
  if (Number(month) < 1 || Number(month) > 12) {
    throw Object.assign(new Error("month must be in YYYY-MM format"), { status: 400 });
  }
  return `${year}-${month}-01`;
}

// Today's month, normalized the same way — used as the default when a request
// doesn't specify one.
function currentMonth() {
  const now = new Date();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${now.getUTCFullYear()}-${month}-01`;
}

module.exports = { normalizeMonth, currentMonth };
