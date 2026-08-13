const { pool } = require("../config/db");
const { normalizeMonth, currentMonth } = require("../utils/month");

// A budget only makes sense attached to one of this user's own *expense*
// categories — checked here rather than trusted from the request body, same
// reasoning as transactions.controller.js's ownership check.
async function assertExpenseCategoryOwnership(categoryId, userId) {
  const result = await pool.query("SELECT id, type FROM categories WHERE id = $1 AND user_id = $2", [
    categoryId,
    userId,
  ]);
  if (result.rows.length === 0) return "not_found";
  if (result.rows[0].type !== "expense") return "wrong_type";
  return "ok";
}

// The core query: one budget row, left-joined against the sum of that same
// category's expense transactions falling inside that budget's month. LEFT
// JOIN (not a plain JOIN) matters here — a brand-new budget with zero
// transactions against it yet should still show up with spent = 0, not
// disappear from the list entirely.
const SELECT_WITH_SPEND = `
  SELECT
    b.id,
    b.category_id,
    c.name AS category_name,
    b.month,
    b.amount,
    COALESCE(SUM(t.amount), 0) AS spent
  FROM budgets b
  JOIN categories c ON c.id = b.category_id
  LEFT JOIN transactions t
    ON t.category_id = b.category_id
   AND t.user_id = b.user_id
   AND t.type = 'expense'
   AND t.transaction_date >= b.month
   AND t.transaction_date < (b.month + INTERVAL '1 month')
`;

async function list(req, res, next) {
  try {
    const month = normalizeMonth(req.query.month || currentMonth());

    const result = await pool.query(
      `${SELECT_WITH_SPEND}
       WHERE b.user_id = $1 AND b.month = $2
       GROUP BY b.id, c.name
       ORDER BY c.name`,
      [req.userId, month]
    );

    res.json({ month, budgets: result.rows });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { categoryId, amount } = req.body;
    const month = normalizeMonth(req.body.month);

    const ownership = await assertExpenseCategoryOwnership(categoryId, req.userId);
    if (ownership === "not_found") {
      return res.status(400).json({ error: "That category doesn't exist on your account" });
    }
    if (ownership === "wrong_type") {
      return res.status(400).json({ error: "Budgets can only be set on expense categories" });
    }

    const inserted = await pool.query(
      `INSERT INTO budgets (user_id, category_id, month, amount)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [req.userId, categoryId, month, amount]
    );

    // Re-select through the same spend-calculating query used by `list`, so a
    // freshly created budget comes back in exactly the same shape (including
    // spent: 0) as everything the dashboard already knows how to render —
    // rather than maintaining a second, slightly different response shape
    // just for this one endpoint.
    const result = await pool.query(
      `${SELECT_WITH_SPEND} WHERE b.id = $1 GROUP BY b.id, c.name`,
      [inserted.rows[0].id]
    );

    res.status(201).json({ budget: result.rows[0] });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "A budget already exists for that category and month" });
    }
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const { amount } = req.body;

    const result = await pool.query(
      `UPDATE budgets
       SET amount = COALESCE($1, amount), updated_at = now()
       WHERE id = $2 AND user_id = $3
       RETURNING id`,
      [amount ?? null, req.params.id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Budget not found" });
    }

    const withSpend = await pool.query(
      `${SELECT_WITH_SPEND} WHERE b.id = $1 GROUP BY b.id, c.name`,
      [result.rows[0].id]
    );

    res.json({ budget: withSpend.rows[0] });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const result = await pool.query("DELETE FROM budgets WHERE id = $1 AND user_id = $2 RETURNING id", [
      req.params.id,
      req.userId,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Budget not found" });
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, update, remove };
