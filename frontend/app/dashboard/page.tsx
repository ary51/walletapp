"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Budget,
  Category,
  Transaction,
  createBudget,
  createCategory,
  createTransaction,
  deleteBudget,
  deleteCategory,
  deleteTransaction,
  getBudgets,
  getCategories,
  getTransactions,
} from "@/lib/api";

function currentMonthValue() {
  return new Date().toISOString().slice(0, 7); // "YYYY-MM", what <input type="month"> uses
}

export default function DashboardPage() {
  const router = useRouter();

  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [budgetMonth, setBudgetMonth] = useState(currentMonthValue);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New-category form state
  const [categoryName, setCategoryName] = useState("");
  const [categoryType, setCategoryType] = useState<"income" | "expense">("expense");

  // New-transaction form state
  const [amount, setAmount] = useState("");
  const [txType, setTxType] = useState<"income" | "expense">("expense");
  const [description, setDescription] = useState("");
  const [transactionDate, setTransactionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [categoryId, setCategoryId] = useState<string>("");

  // New-budget form state
  const [budgetCategoryId, setBudgetCategoryId] = useState("");
  const [budgetAmount, setBudgetAmount] = useState("");

  async function loadData(month: string) {
    try {
      const [categoriesRes, transactionsRes, budgetsRes] = await Promise.all([
        getCategories(),
        getTransactions(),
        getBudgets(month),
      ]);
      setCategories(categoriesRes.categories);
      setTransactions(transactionsRes.transactions);
      setBudgets(budgetsRes.budgets);
    } catch (err) {
      // A 401 here means the token is missing/expired — bounce back to login
      // rather than showing an empty dashboard forever.
      if (err instanceof Error && /invalid or expired token|missing or malformed/i.test(err.message)) {
        router.push("/login");
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load your data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!localStorage.getItem("walletapp_token")) {
      router.push("/login");
      return;
    }
    loadData(budgetMonth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budgetMonth]);

  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createCategory({ name: categoryName, type: categoryType });
      setCategoryName("");
      await loadData(budgetMonth);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add category");
    }
  }

  async function handleDeleteCategory(id: number) {
    setError(null);
    try {
      await deleteCategory(id);
      await loadData(budgetMonth);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete category");
    }
  }

  async function handleAddTransaction(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createTransaction({
        amount: Number(amount),
        type: txType,
        description: description || undefined,
        transactionDate,
        categoryId: categoryId ? Number(categoryId) : null,
      });
      setAmount("");
      setDescription("");
      // A new transaction can change a budget's spent-to-date, so budgets
      // need reloading too, not just the transaction list.
      await loadData(budgetMonth);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add transaction");
    }
  }

  async function handleDeleteTransaction(id: number) {
    setError(null);
    try {
      await deleteTransaction(id);
      await loadData(budgetMonth);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete transaction");
    }
  }

  async function handleAddBudget(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createBudget({
        categoryId: Number(budgetCategoryId),
        month: budgetMonth,
        amount: Number(budgetAmount),
      });
      setBudgetCategoryId("");
      setBudgetAmount("");
      await loadData(budgetMonth);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add budget");
    }
  }

  async function handleDeleteBudget(id: number) {
    setError(null);
    try {
      await deleteBudget(id);
      await loadData(budgetMonth);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete budget");
    }
  }

  function categoryName_(id: number | null) {
    if (id === null) return "Uncategorized";
    return categories.find((c) => c.id === id)?.name || "Uncategorized";
  }

  const expenseCategories = categories.filter((c) => c.type === "expense");
  // Categories that already have a budget this month shouldn't be offered
  // again in the "add budget" form — the API would just reject it as a
  // duplicate, so filtering it out here avoids a round-trip just to find that out.
  const budgetableCategories = expenseCategories.filter(
    (c) => !budgets.some((b) => b.category_id === c.id)
  );

  if (loading) {
    return (
      <main className="dashboard">
        <p>Loading...</p>
      </main>
    );
  }

  return (
    <main className="dashboard">
      <h1>Dashboard</h1>
      {error && <p className="error">{error}</p>}

      <div className="dashboard-columns">
        <div className="panel">
          <h2>Categories</h2>

          <form className="stacked" onSubmit={handleAddCategory}>
            <input
              placeholder="Category name"
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              required
            />
            <select value={categoryType} onChange={(e) => setCategoryType(e.target.value as "income" | "expense")}>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
            <button type="submit">Add category</button>
          </form>

          {categories.length === 0 ? (
            <p className="empty">No categories yet.</p>
          ) : (
            <ul className="row-list">
              {categories.map((c) => (
                <li key={c.id}>
                  <span>
                    {c.name} <span className={`badge ${c.type}`}>{c.type}</span>
                  </span>
                  <button type="button" className="icon-button" onClick={() => handleDeleteCategory(c.id)}>
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="panel">
          <h2>Transactions</h2>

          <form onSubmit={handleAddTransaction}>
            <input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
            <select value={txType} onChange={(e) => setTxType(e.target.value as "income" | "expense")}>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Uncategorized</option>
              {categories
                .filter((c) => c.type === txType)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
            <input
              type="date"
              value={transactionDate}
              onChange={(e) => setTransactionDate(e.target.value)}
              required
            />
            <input
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <button type="submit">Add transaction</button>
          </form>

          {transactions.length === 0 ? (
            <p className="empty">No transactions yet — add your first one above.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id}>
                    <td>{t.transaction_date.slice(0, 10)}</td>
                    <td>{t.description || "—"}</td>
                    <td>{categoryName_(t.category_id)}</td>
                    <td className="amount" style={{ color: t.type === "income" ? "#1a7f37" : "#c0362c" }}>
                      {t.type === "income" ? "+" : "−"}${Number(t.amount).toFixed(2)}
                    </td>
                    <td>
                      <button type="button" className="icon-button" onClick={() => handleDeleteTransaction(t.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="panel budgets-panel">
        <div className="budgets-header">
          <h2>Budgets</h2>
          <input
            type="month"
            value={budgetMonth}
            onChange={(e) => setBudgetMonth(e.target.value)}
            aria-label="Budget month"
          />
        </div>

        <form onSubmit={handleAddBudget}>
          <select value={budgetCategoryId} onChange={(e) => setBudgetCategoryId(e.target.value)} required>
            <option value="" disabled>
              Choose a category…
            </option>
            {budgetableCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            step="0.01"
            min="0.01"
            placeholder="Monthly limit"
            value={budgetAmount}
            onChange={(e) => setBudgetAmount(e.target.value)}
            required
          />
          <button type="submit" disabled={budgetableCategories.length === 0}>
            Add budget
          </button>
        </form>

        {expenseCategories.length === 0 ? (
          <p className="empty">Add an expense category first to set a budget against it.</p>
        ) : budgets.length === 0 ? (
          <p className="empty">No budgets set for this month yet.</p>
        ) : (
          <ul className="row-list budget-list">
            {budgets.map((b) => {
              const limit = Number(b.amount);
              const spent = Number(b.spent);
              const pct = limit > 0 ? Math.min((spent / limit) * 100, 100) : 0;
              const over = spent > limit;
              return (
                <li key={b.id} className="budget-row">
                  <div className="budget-row-top">
                    <span>{b.category_name}</span>
                    <span className={over ? "budget-amount over" : "budget-amount"}>
                      ${spent.toFixed(2)} / ${limit.toFixed(2)}
                    </span>
                    <button type="button" className="icon-button" onClick={() => handleDeleteBudget(b.id)}>
                      Delete
                    </button>
                  </div>
                  <div className="budget-bar-track">
                    <div
                      className={over ? "budget-bar-fill over" : "budget-bar-fill"}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
