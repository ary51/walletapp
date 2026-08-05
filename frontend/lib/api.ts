// Thin wrapper around fetch() so the components don't repeat the base URL and
// JSON boilerplate. NEXT_PUBLIC_API_URL is exposed to the browser (any env var
// prefixed with NEXT_PUBLIC_ is bundled into client-side JS by Next.js — never
// put a secret behind that prefix).

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export type AuthResponse = {
  token: string;
  user: { id: number; email: string; fullName: string };
};

async function request<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || "Something went wrong");
  }

  return data as T;
}

export function signup(input: { email: string; password: string; fullName: string }) {
  return request<AuthResponse>("/api/auth/signup", input);
}

export function login(input: { email: string; password: string }) {
  return request<AuthResponse>("/api/auth/login", input);
}
