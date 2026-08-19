"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Budget,
  CategorySpending,
  MonthlyTrendPoint,
  getBudgets,
  getMonthlyTrend,
  getSpendingByCategory,
} from "@/lib/api";

function currentMonthValue() {
  return new Date().toISOString().slice(0, 7);
}

// A fixed palette so pie slices are stable/distinct across renders, instead
// of Recharts picking arbitrary colors. Enough entries that categories only
// start repeating colors well past what fits comfortably in a legend anyway.
const PALETTE = ["#2f6feb", "#c0362c", "#1a7f37", "#b6862c", "#7a4fd6", "#0f9aa8", "#d6558a", "#5c6773"];

const currency = (n: number) => `$${n.toFixed(2)}`;

// Recharts' Tooltip formatter prop is typed against its own internal
// ValueType (which can be undefined, a string, or an array), not a plain
// number — so this coerces whatever it hands back before formatting, rather
// than fighting that type in every <Tooltip> below.
function tooltipCurrency(value: unknown): string {
  return currency(Number(value ?? 0));
}

export default function ReportsPage() {
  const router = useRouter();

  const [month, setMonth] = useState(currentMonthValue);
  const [categorySpending, setCategorySpending] = useState<CategorySpending[]>([]);
  const [trend, setTrend] = useState<MonthlyTrendPoint[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!localStorage.getItem("walletapp_token")) {
      router.push("/login");
      return;
    }

    async function load() {
      try {
        const [spendingRes, trendRes, budgetsRes] = await Promise.all([
          getSpendingByCategory(month),
          getMonthlyTrend(6),
          getBudgets(month),
        ]);
        setCategorySpending(spendingRes.categories);
        setTrend(trendRes.trend);
        setBudgets(budgetsRes.budgets);
      } catch (err) {
        if (err instanceof Error && /invalid or expired token|missing or malformed/i.test(err.message)) {
          router.push("/login");
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load report data");
      } finally {
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  // Recharts wants plain numbers, but the API returns NUMERIC as strings (see
  // the Transaction/Budget type comments in lib/api.ts) — convert once here
  // rather than scattering Number(...) through the JSX below.
  const pieData = categorySpending.map((c) => ({ name: c.category_name, value: Number(c.total) }));

  const trendData = trend.map((t) => ({
    month: new Date(t.month).toLocaleDateString(undefined, { month: "short", year: "2-digit" }),
    Income: Number(t.income),
    Expense: Number(t.expense),
  }));

  const budgetData = budgets.map((b) => ({
    name: b.category_name,
    Budget: Number(b.amount),
    Spent: Number(b.spent),
  }));

  if (loading) {
    return (
      <main className="dashboard">
        <p>Loading...</p>
      </main>
    );
  }

  return (
    <main className="dashboard">
      <div className="budgets-header">
        <h1>Reports</h1>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Report month" />
      </div>
      {error && <p className="error">{error}</p>}

      <div className="panel">
        <h2>Spending by category</h2>
        {pieData.length === 0 ? (
          <p className="empty">No expenses recorded for this month yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={70} outerRadius={110} paddingAngle={2}>
                {pieData.map((_, i) => (
                  <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                ))}
              </Pie>
              <Tooltip formatter={tooltipCurrency} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="panel budgets-panel">
        <h2>Income vs. expense (last 6 months)</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={trendData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="month" fontSize={12} />
            <YAxis fontSize={12} tickFormatter={(v) => `$${v}`} />
            <Tooltip formatter={tooltipCurrency} />
            <Legend />
            <Bar dataKey="Income" fill="#1a7f37" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Expense" fill="#c0362c" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="panel budgets-panel">
        <h2>Budget vs. actual</h2>
        {budgetData.length === 0 ? (
          <p className="empty">No budgets set for this month — set one on the dashboard first.</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(220, budgetData.length * 60)}>
            <BarChart data={budgetData} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" fontSize={12} tickFormatter={(v) => `$${v}`} />
              <YAxis type="category" dataKey="name" fontSize={12} width={100} />
              <Tooltip formatter={tooltipCurrency} />
              <Legend />
              <Bar dataKey="Budget" fill="#9db6e8" radius={[0, 4, 4, 0]} />
              <Bar dataKey="Spent" fill="#2f6feb" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </main>
  );
}
