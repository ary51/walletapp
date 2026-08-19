const { pool } = require("../config/db");
const { normalizeMonth, currentMonth } = require("../utils/month");

// One expense total per category for a given month, including an
// "Uncategorized" bucket for expense transactions with no category_id — a
// plain JOIN would silently drop those rows instead of surfacing them.
async function spendingByCategory(req, res, next) {
  try {
    const month = normalizeMonth(req.query.month || currentMonth());

    const result = await pool.query(
      `SELECT
         COALESCE(c.id, 0) AS category_id,
         COALESCE(c.name, 'Uncategorized') AS category_name,
         SUM(t.amount) AS total
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.user_id = $1
         AND t.type = 'expense'
         AND t.transaction_date >= $2
         AND t.transaction_date < ($2::date + INTERVAL '1 month')
       GROUP BY COALESCE(c.id, 0), COALESCE(c.name, 'Uncategorized')
       ORDER BY total DESC`,
      [req.userId, month]
    );

    res.json({ month, categories: result.rows });
  } catch (err) {
    next(err);
  }
}

// Income vs. expense totals for each of the last N months, including months
// with zero transactions — a plain GROUP BY on transactions alone would just
// skip a month with no activity instead of showing it as $0.
async function monthlyTrend(req, res, next) {
  try {
    const months = Math.min(Math.max(parseInt(req.query.months, 10) || 6, 1), 24);

    const result = await pool.query(
      `WITH month_series AS (
         SELECT generate_series(
           date_trunc('month', now()) - ($2::int - 1) * INTERVAL '1 month',
           date_trunc('month', now()),
           INTERVAL '1 month'
         )::date AS month
       )
       SELECT
         ms.month,
         COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'income'), 0) AS income,
         COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'expense'), 0) AS expense
       FROM month_series ms
       LEFT JOIN transactions t
         ON t.user_id = $1
        AND t.transaction_date >= ms.month
        AND t.transaction_date < (ms.month + INTERVAL '1 month')
       GROUP BY ms.month
       ORDER BY ms.month`,
      [req.userId, months]
    );

    res.json({ trend: result.rows });
  } catch (err) {
    next(err);
  }
}

module.exports = { spendingByCategory, monthlyTrend };
