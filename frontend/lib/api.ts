// Thin wrapper around fetch() so the components don't repeat the base URL and
// JSON boilerplate. NEXT_PUBLIC_API_URL is exposed to the browser (any env var
// prefixed with NEXT_PUBLIC_ is bundled into client-side JS by Next.js — never
// put a secret behind that prefix).

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export type AuthResponse = {
  token: string;
  user: { id: number; email: string; fullName: string };
};

export type Category = {
  id: number;
  name: string;
  type: "income" | "expense";
  created_at: string;
};

export type Transaction = {
  id: number;
  category_id: number | null;
  amount: string; // Postgres NUMERIC comes back over JSON as a string, not a
  // JS number — that's deliberate on Postgres's part, since converting a
  // precise decimal to a JS float could quietly lose precision. Format it for
  // display with Number(amount), but don't do math on it beyond that here.
  type: "income" | "expense";
  description: string | null;
  transaction_date: string;
  created_at: string;
  source: "manual" | "plaid";
};

export type PlaidAccountSummary = { name: string; mask: string | null; subtype: string | null };

export type PlaidItem = {
  id: number;
  institution_name: string | null;
  created_at: string;
  accounts: PlaidAccountSummary[];
};

export type Budget = {
  id: number;
  category_id: number;
  category_name: string;
  month: string;
  amount: string; // NUMERIC, same string-not-number reasoning as Transaction.amount above
  spent: string;
};

export type CategorySpending = { category_id: number; category_name: string; total: string };

export type MonthlyTrendPoint = { month: string; income: string; expense: string };

function getToken(): string | null {
  if (typeof window === "undefined") return null; // guards against server-side rendering, where there's no browser/localStorage at all
  return localStorage.getItem("walletapp_token");
}

async function request<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = getToken();

  const res = await fetch(`${API_URL}${path}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      // Every categories/transactions endpoint requires this — it's what
      // requireAuth on the backend checks for. Signup/login are the only
      // calls made before a token exists, which is why this file's original
      // two functions didn't need it.
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  // 204 No Content (our delete endpoints) has no body to parse.
  if (res.status === 204) return undefined as T;

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || "Something went wrong");
  }

  return data as T;
}

export function signup(input: { email: string; password: string; fullName: string }) {
  return request<AuthResponse>("/api/auth/signup", { method: "POST", body: input });
}

export function login(input: { email: string; password: string }) {
  return request<AuthResponse>("/api/auth/login", { method: "POST", body: input });
}

export function getCategories() {
  return request<{ categories: Category[] }>("/api/categories");
}

export function createCategory(input: { name: string; type: "income" | "expense" }) {
  return request<{ category: Category }>("/api/categories", { method: "POST", body: input });
}

export function deleteCategory(id: number) {
  return request<void>(`/api/categories/${id}`, { method: "DELETE" });
}

export function getTransactions() {
  return request<{ transactions: Transaction[] }>("/api/transactions");
}

export function createTransaction(input: {
  amount: number;
  type: "income" | "expense";
  description?: string;
  transactionDate: string;
  categoryId?: number | null;
}) {
  return request<{ transaction: Transaction }>("/api/transactions", { method: "POST", body: input });
}

export function deleteTransaction(id: number) {
  return request<void>(`/api/transactions/${id}`, { method: "DELETE" });
}

export function getBudgets(month: string) {
  return request<{ month: string; budgets: Budget[] }>(`/api/budgets?month=${month}`);
}

export function createBudget(input: { categoryId: number; month: string; amount: number }) {
  return request<{ budget: Budget }>("/api/budgets", { method: "POST", body: input });
}

export function updateBudget(id: number, input: { amount: number }) {
  return request<{ budget: Budget }>(`/api/budgets/${id}`, { method: "PUT", body: input });
}

export function deleteBudget(id: number) {
  return request<void>(`/api/budgets/${id}`, { method: "DELETE" });
}

export function createPlaidLinkToken() {
  return request<{ linkToken: string }>("/api/plaid/link-token", { method: "POST" });
}

export function exchangePlaidPublicToken(publicToken: string) {
  return request<{ plaidItemId: number; institutionName: string | null }>("/api/plaid/exchange-token", {
    method: "POST",
    body: { publicToken },
  });
}

export function syncPlaidTransactions() {
  return request<{ synced: number; imported: number }>("/api/plaid/sync", { method: "POST" });
}

export function getPlaidItems() {
  return request<{ items: PlaidItem[] }>("/api/plaid/items");
}

export function deletePlaidItem(id: number) {
  return request<void>(`/api/plaid/items/${id}`, { method: "DELETE" });
}

export function getSpendingByCategory(month: string) {
  return request<{ month: string; categories: CategorySpending[] }>(
    `/api/reports/spending-by-category?month=${month}`
  );
}

export function getMonthlyTrend(months: number) {
  return request<{ trend: MonthlyTrendPoint[] }>(`/api/reports/monthly-trend?months=${months}`);
}
