"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signup } from "@/lib/api";

export default function SignupPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const data = await signup({ email, password, fullName });
      // localStorage is the simplest place to keep the JWT for now. A
      // production app would more likely use an httpOnly cookie instead,
      // since JS running on the page (including any injected via an XSS bug)
      // can read localStorage but can't read an httpOnly cookie. That's a
      // hardening step for later, not something blocking this phase.
      localStorage.setItem("walletapp_token", data.token);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
    // No `finally` resetting loading: on success we're navigating away, so
    // leaving the button disabled/"Creating account..." until the new page
    // takes over reads better than it flashing back before the redirect.
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

      <p>
        Already have an account? <a href="/login">Log in</a>
      </p>
    </main>
  );
}
