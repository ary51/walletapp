const { pool } = require("../config/db");

// If a category_id was given, make sure it's actually one of this user's own
// categories before letting a transaction attach to it. Without this check,
// user A could pass user B's category_id and the foreign key would happily
// accept it — nothing about a plain foreign key knows or cares which user
// owns which row, so that has to be enforced here in application code.
async function assertCategoryOwnership(categoryId, userId) {
  if (categoryId === undefined || categoryId === null) return true;
  const result = await pool.query("SELECT id FROM categories WHERE id = $1 AND user_id = $2", [
    categoryId,
    userId,
  ]);
  return result.rows.length > 0;
}

async function list(req, res, next) {
  try {
    // Optional query-string filters, e.g. GET /api/transactions?type=expense
    const { type, categoryId } = req.query;

    const conditions = ["user_id = $1"];
    const params = [req.userId];

    if (type) {
      params.push(type);
      conditions.push(`type = $${params.length}`);
    }
    if (categoryId) {
      params.push(categoryId);
      conditions.push(`category_id = $${params.length}`);
    }

    const result = await pool.query(
      `SELECT id, category_id, amount, type, description, transaction_date, created_at
       FROM transactions
       WHERE ${conditions.join(" AND ")}
       ORDER BY transaction_date DESC, created_at DESC`,
      params
    );

    res.json({ transactions: result.rows });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { amount, type, description, transactionDate, categoryId } = req.body;

    if (!(await assertCategoryOwnership(categoryId, req.userId))) {
      return res.status(400).json({ error: "That category doesn't exist on your account" });
    }

    const result = await pool.query(
      `INSERT INTO transactions (user_id, category_id, amount, type, description, transaction_date)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, category_id, amount, type, description, transaction_date, created_at`,
      [req.userId, categoryId ?? null, amount, type, description ?? null, transactionDate]
    );

    res.status(201).json({ transaction: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const { amount, type, description, transactionDate, categoryId } = req.body;
    // Note: this COALESCE-based "only overwrite what was sent" approach can't
    // distinguish "don't change this field" from "explicitly clear it back to
    // null" — sending categoryId: null here won't uncategorize a transaction,
    // it'll just leave the existing category alone. Fine for Phase 2; if
    // "uncategorize" becomes a real feature, that one field needs its own
    // explicit-null handling instead of relying on COALESCE.

    if (categoryId !== undefined && !(await assertCategoryOwnership(categoryId, req.userId))) {
      return res.status(400).json({ error: "That category doesn't exist on your account" });
    }

    const result = await pool.query(
      `UPDATE transactions
       SET amount = COALESCE($1, amount),
           type = COALESCE($2, type),
           description = COALESCE($3, description),
           transaction_date = COALESCE($4, transaction_date),
           category_id = COALESCE($5, category_id),
           updated_at = now()
       WHERE id = $6 AND user_id = $7
       RETURNING id, category_id, amount, type, description, transaction_date, created_at`,
      [amount ?? null, type ?? null, description ?? null, transactionDate ?? null, categoryId ?? null, req.params.id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    res.json({ transaction: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const result = await pool.query(
      "DELETE FROM transactions WHERE id = $1 AND user_id = $2 RETURNING id",
      [req.params.id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, update, remove };
