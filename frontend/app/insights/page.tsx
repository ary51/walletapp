"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Anomaly,
  BudgetRecommendation,
  createBudget,
  explainTransaction,
  getAnomalies,
  getBudgetRecommendations,
  getSpendingSummary,
} from "@/lib/api";

function currentMonthValue() {
  return new Date().toISOString().slice(0, 7);
}

export default function InsightsPage() {
  const router = useRouter();

  const [month, setMonth] = useState(currentMonthValue);
  const [error, setError] = useState<string | null>(null);

  // Summary — user-triggered, since each click is a real LLM call.
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Budget recommendations — also user-triggered.
  const [recommendations, setRecommendations] = useState<BudgetRecommendation[] | null>(null);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [addedCategoryIds, setAddedCategoryIds] = useState<number[]>([]);

  // Anomalies — pure arithmetic on the backend, no AI cost, safe to load
  // automatically whenever the month changes.
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [anomaliesLoading, setAnomaliesLoading] = useState(true);
  const [explanations, setExplanations] = useState<Record<number, string>>({});
  const [explainingId, setExplainingId] = useState<number | null>(null);

  useEffect(() => {
    if (!localStorage.getItem("walletapp_token")) {
      router.push("/login");
      return;
    }

    setAnomaliesLoading(true);
    getAnomalies(month)
      .then((res) => setAnomalies(res.anomalies))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load anomalies"))
      .finally(() => setAnomaliesLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  async function handleGenerateSummary() {
    setError(null);
    setSummaryLoading(true);
    try {
      const res = await getSpendingSummary(month);
      setSummary(res.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate summary");
    } finally {
      setSummaryLoading(false);
    }
  }

  async function handleGetRecommendations() {
    setError(null);
    setRecommendationsLoading(true);
    try {
      const res = await getBudgetRecommendations();
      setRecommendations(res.recommendations);
      setAddedCategoryIds([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get budget recommendations");
    } finally {
      setRecommendationsLoading(false);
    }
  }

  async function handleAddRecommendedBudget(rec: BudgetRecommendation) {
    if (!rec.categoryId) return;
    setError(null);
    try {
      await createBudget({ categoryId: rec.categoryId, month, amount: rec.recommendedAmount });
      setAddedCategoryIds((prev) => [...prev, rec.categoryId as number]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add budget");
    }
  }

  async function handleExplain(id: number) {
    setError(null);
    setExplainingId(id);
    try {
      const res = await explainTransaction(id);
      setExplanations((prev) => ({ ...prev, [id]: res.explanation }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get an explanation");
    } finally {
      setExplainingId(null);
    }
  }

  return (
    <main className="dashboard">
      <div className="budgets-header">
        <h1>Insights</h1>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Insights month" />
      </div>
      {error && <p className="error">{error}</p>}

      <div className="panel">
        <h2>Spending summary</h2>
        <p className="empty" style={{ marginTop: 0 }}>
          A short AI-generated summary of this month's spending compared to last month.
        </p>
        <button type="button" onClick={handleGenerateSummary} disabled={summaryLoading}>
          {summaryLoading ? "Generating…" : summary ? "Regenerate summary" : "Generate summary"}
        </button>
        {summary && <p style={{ marginTop: 16, lineHeight: 1.6 }}>{summary}</p>}
      </div>

      <div className="panel budgets-panel">
        <h2>Budget recommendations</h2>
        <p className="empty" style={{ marginTop: 0 }}>
          Suggested monthly limits based on your last 6 months of spending.
        </p>
        <button type="button" onClick={handleGetRecommendations} disabled={recommendationsLoading}>
          {recommendationsLoading ? "Thinking…" : recommendations ? "Regenerate" : "Get recommendations"}
        </button>

        {recommendations && recommendations.length === 0 && (
          <p className="empty">Not enough spending history yet to make recommendations.</p>
        )}

        {recommendations && recommendations.length > 0 && (
          <ul className="row-list" style={{ marginTop: 16 }}>
            {recommendations.map((rec) => {
              const added = rec.categoryId !== null && addedCategoryIds.includes(rec.categoryId);
              return (
                <li key={rec.categoryName} className="budget-row">
                  <div className="budget-row-top">
                    <span>
                      <strong>{rec.categoryName}</strong> — ${rec.recommendedAmount.toFixed(2)}/mo
                    </span>
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => handleAddRecommendedBudget(rec)}
                      disabled={added || !rec.categoryId}
                    >
                      {added ? "Added ✓" : "Add this budget"}
                    </button>
                  </div>
                  <p className="empty" style={{ margin: 0 }}>
                    {rec.reasoning}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="panel budgets-panel">
        <h2>Unusual transactions</h2>
        <p className="empty" style={{ marginTop: 0 }}>
          Flagged automatically when a transaction is well above your typical spending in that category — this
          check is plain statistics, not AI, so it's free and always on.
        </p>

        {anomaliesLoading ? (
          <p className="empty">Checking…</p>
        ) : anomalies.length === 0 ? (
          <p className="empty">Nothing unusual this month.</p>
        ) : (
          <ul className="row-list" style={{ marginTop: 16 }}>
            {anomalies.map((a) => (
              <li key={a.id} className="budget-row">
                <div className="budget-row-top">
                  <span>
                    {a.description || a.categoryName} — ${Number(a.amount).toFixed(2)}
                    <span className="badge expense" style={{ marginLeft: 8 }}>
                      {a.categoryName}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => handleExplain(a.id)}
                    disabled={explainingId === a.id || Boolean(explanations[a.id])}
                  >
                    {explanations[a.id] ? "Explained" : explainingId === a.id ? "Asking…" : "Explain"}
                  </button>
                </div>
                <p className="empty" style={{ margin: 0 }}>
                  {a.reason}
                </p>
                {explanations[a.id] && <p style={{ margin: "8px 0 0", lineHeight: 1.5 }}>{explanations[a.id]}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
