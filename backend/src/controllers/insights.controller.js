const { pool } = require("../config/db");
const { getGeminiClient, MODEL } = require("../config/gemini");
const { normalizeMonth, currentMonth } = require("../utils/month");

function previousMonth(monthStart) {
  const d = new Date(monthStart); // "YYYY-MM-01" parses as UTC midnight
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 10);
}

// Income/expense totals, plus an expense-by-category breakdown, for one
// calendar month. Shared by the summary endpoint for "this month vs last
// month" — kept as a small helper instead of writing the query twice.
async function monthTotals(userId, monthStart) {
  const result = await pool.query(
    `SELECT t.type, COALESCE(c.name, 'Uncategorized') AS category_name, SUM(t.amount) AS total
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.category_id
     WHERE t.user_id = $1
       AND t.transaction_date >= $2
       AND t.transaction_date < ($2::date + INTERVAL '1 month')
     GROUP BY t.type, COALESCE(c.name, 'Uncategorized')`,
    [userId, monthStart]
  );

  const totals = { income: 0, expense: 0, expenseByCategory: {} };
  for (const row of result.rows) {
    const amount = Number(row.total);
    if (row.type === "income") {
      totals.income += amount;
    } else {
      totals.expense += amount;
      totals.expenseByCategory[row.category_name] = amount;
    }
  }
  return totals;
}

// A natural-language "what happened this month" summary, generated from real
// numbers pulled from the database — the model never invents figures, it
// only narrates the JSON payload it's handed.
async function spendingSummary(req, res, next) {
  try {
    const month = normalizeMonth(req.query.month || currentMonth());
    const prevMonth = previousMonth(month);

    const [current, previous, budgetsResult] = await Promise.all([
      monthTotals(req.userId, month),
      monthTotals(req.userId, prevMonth),
      pool.query(
        `SELECT COALESCE(c.name, 'Uncategorized') AS category_name, b.amount
         FROM budgets b JOIN categories c ON c.id = b.category_id
         WHERE b.user_id = $1 AND b.month = $2`,
        [req.userId, month]
      ),
    ]);

    const payload = {
      month,
      income: { thisMonth: current.income, lastMonth: previous.income },
      expenses: { thisMonth: current.expense, lastMonth: previous.expense },
      spendingByCategoryThisMonth: current.expenseByCategory,
      spendingByCategoryLastMonth: previous.expenseByCategory,
      budgets: Object.fromEntries(budgetsResult.rows.map((r) => [r.category_name, Number(r.amount)])),
    };

    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: JSON.stringify(payload),
      config: {
        systemInstruction:
          "You are a friendly personal finance assistant embedded in a budgeting app. Given a user's " +
          "structured spending data for one month compared to the previous month, write a short summary " +
          "(3-5 sentences, plain prose, no markdown headers or bullet lists) highlighting what changed and " +
          "anything worth their attention, such as a category that grew a lot or a budget that's close to " +
          "or over its limit. Only reference numbers present in the data — never invent figures. If nothing " +
          "stands out, say so plainly instead of manufacturing concern.",
      },
    });

    res.json({ summary: response.text });
  } catch (err) {
    next(err);
  }
}

// Suggests a monthly budget per category based on trailing spending history.
// Pure LLM judgment on top of real averages — the averages themselves are
// computed here in SQL/JS, not by the model.
async function budgetRecommendations(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT
         c.id AS category_id,
         c.name AS category_name,
         SUM(t.amount) AS total,
         COUNT(DISTINCT date_trunc('month', t.transaction_date)) AS months_with_data
       FROM transactions t
       JOIN categories c ON c.id = t.category_id
       WHERE t.user_id = $1
         AND t.type = 'expense'
         AND t.transaction_date >= (date_trunc('month', now()) - INTERVAL '6 months')
       GROUP BY c.id, c.name`,
      [req.userId]
    );

    if (result.rows.length === 0) {
      return res.json({ recommendations: [] });
    }

    const categoryIdByName = new Map();
    const payload = result.rows.map((row) => {
      categoryIdByName.set(row.category_name, row.category_id);
      const months = Math.max(Number(row.months_with_data), 1);
      return {
        categoryName: row.category_name,
        averageMonthlySpend: Math.round((Number(row.total) / months) * 100) / 100,
        monthsOfData: Number(row.months_with_data),
      };
    });

    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: JSON.stringify(payload),
      config: {
        // Gemini's JSON mode: constrains the response to valid JSON matching
        // this shape, instead of relying purely on prompt instructions (which
        // models can still drift from under free-text generation).
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            recommendations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  categoryName: { type: "string" },
                  recommendedAmount: { type: "number" },
                  reasoning: { type: "string" },
                },
                required: ["categoryName", "recommendedAmount", "reasoning"],
              },
            },
          },
          required: ["recommendations"],
        },
        systemInstruction:
          "You suggest monthly budget amounts for a personal finance app. Given each category's average " +
          "monthly spend and how many months of data back it, produce one recommendation per category given. " +
          "recommendedAmount should be a sensible round number, usually at or slightly above the average (a " +
          "little headroom, not a hard cap that gets blown every month). reasoning should be one short plain " +
          "sentence. Categories with only 1 month of data deserve a reasoning that notes the estimate is based " +
          "on limited history.",
      },
    });

    const parsed = JSON.parse(response.text);
    const recommendations = (parsed.recommendations || []).map((r) => ({
      ...r,
      categoryId: categoryIdByName.get(r.categoryName) ?? null,
    }));

    res.json({ recommendations });
  } catch (err) {
    next(err);
  }
}

// Statistically flags transactions that are unusually large for their
// category — plain arithmetic, no AI involved. The LLM only gets invoked
// later, per-transaction, if the user asks for an explanation of one.
async function anomalies(req, res, next) {
  try {
    const month = normalizeMonth(req.query.month || currentMonth());

    const [baseline, monthTx] = await Promise.all([
      // The "normal" range for each category, built only from history
      // *before* the month being checked — so a category isn't judged
      // against transactions that are themselves part of what's being
      // evaluated. Categories with fewer than 5 prior transactions are
      // excluded — not enough history to call anything "unusual" yet.
      pool.query(
        `SELECT category_id, AVG(amount) AS avg_amount, STDDEV_POP(amount) AS stddev_amount, COUNT(*) AS n
         FROM transactions
         WHERE user_id = $1 AND type = 'expense' AND category_id IS NOT NULL AND transaction_date < $2
         GROUP BY category_id
         HAVING COUNT(*) >= 5`,
        [req.userId, month]
      ),
      pool.query(
        `SELECT t.id, t.category_id, c.name AS category_name, t.amount, t.description, t.transaction_date
         FROM transactions t
         JOIN categories c ON c.id = t.category_id
         WHERE t.user_id = $1 AND t.type = 'expense'
           AND t.transaction_date >= $2 AND t.transaction_date < ($2::date + INTERVAL '1 month')`,
        [req.userId, month]
      ),
    ]);

    const baselineByCategory = new Map(baseline.rows.map((r) => [r.category_id, r]));

    const flagged = [];
    for (const tx of monthTx.rows) {
      const stats = baselineByCategory.get(tx.category_id);
      if (!stats) continue;

      const avg = Number(stats.avg_amount);
      const stddev = Number(stats.stddev_amount);
      const amount = Number(tx.amount);

      // Flag anything more than 2 standard deviations above the category's
      // usual amount. When a category's history is very consistent (stddev
      // near 0), fall back to "50% above average" so a $0.01 variance
      // doesn't make everything look like an outlier.
      const threshold = stddev > 0.01 ? avg + 2 * stddev : avg * 1.5;
      if (amount > threshold && amount > avg * 1.2) {
        const pctAboveAvg = Math.round(((amount - avg) / avg) * 100);
        flagged.push({
          id: tx.id,
          description: tx.description,
          amount: tx.amount,
          categoryName: tx.category_name,
          transactionDate: tx.transaction_date,
          reason: `${pctAboveAvg}% above your typical ${tx.category_name} transaction (avg $${avg.toFixed(2)})`,
        });
      }
    }

    res.json({ month, anomalies: flagged });
  } catch (err) {
    next(err);
  }
}

// On-demand, plain-language explanation for one flagged transaction —
// the only insights endpoint that costs an LLM call per click, deliberately,
// since it's triggered by explicit user interest rather than a page load.
async function explainTransaction(req, res, next) {
  try {
    const txResult = await pool.query(
      `SELECT t.amount, t.description, t.transaction_date, c.name AS category_name
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.id = $1 AND t.user_id = $2`,
      [req.params.id, req.userId]
    );

    if (txResult.rows.length === 0) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    const tx = txResult.rows[0];

    const statsResult = await pool.query(
      `SELECT AVG(t.amount) AS avg_amount, COUNT(*) AS n
       FROM transactions t
       WHERE t.user_id = $1 AND t.type = 'expense'
         AND t.category_id = (SELECT category_id FROM transactions WHERE id = $2)`,
      [req.userId, req.params.id]
    );

    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: JSON.stringify({
        amount: tx.amount,
        description: tx.description,
        category: tx.category_name,
        date: tx.transaction_date,
        categoryAverage: Number(statsResult.rows[0].avg_amount || 0),
      }),
      config: {
        systemInstruction:
          "You help explain a single flagged transaction in a personal budgeting app, in 2-3 short " +
          "plain-language sentences. It was flagged only because it's statistically larger than the " +
          "user's usual spending in that category — that alone does not mean anything is wrong. Offer " +
          "plausible, everyday explanations (a bigger-than-usual grocery run, a one-time purchase, a gift) " +
          "and note that if the user doesn't recognize it, checking their account/card statement is a " +
          "reasonable next step. Never assert fraud or wrongdoing.",
      },
    });

    res.json({ explanation: response.text });
  } catch (err) {
    next(err);
  }
}

module.exports = { spendingSummary, budgetRecommendations, anomalies, explainTransaction };
