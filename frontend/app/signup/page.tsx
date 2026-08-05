"use client";

import { useState } from "react";
import { signup } from "@/lib/api";

export default function SignupPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const data = await signup({ email, password, fullName });
      // localStorage is the simplest place to keep the JWT for a Phase 1 demo.
      // A production app would more likely use an httpOnly cookie instead, since
      // JS running on the page (including any injected via an XSS bug) can read
      // localStorage but can't read an httpOnly cookie. That's a Phase-2+ hardening
      // step, not something we need to block Phase 1 on.
      localStorage.setItem("walletapp_token", data.token);
      setToken(data.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <h1>Sign up</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="fullName">Full name</label>
          <input
            id="fullName"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button type="submit" disabled={loading}>
          {loading ? "Creating account..." : "Sign up"}
        </button>
      </form>

      {error && <p className="error">{error}</p>}
      {token && (
        <p className="success">
          Account created! JWT received and saved: <br />
          {token}
        </p>
      )}

      <p>
        Already have an account? <a href="/login">Log in</a>
      </p>
    </main>
  );
}
