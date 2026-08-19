"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

// The root layout (layout.tsx) is a plain server component — it can't read
// localStorage itself, since that only exists in the browser. This small
// client component is carved out just so the nav bar can show something
// different depending on whether you're logged in, without turning the whole
// layout into a client component.
export default function NavAuth() {
  const pathname = usePathname();
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    // The layout (and this component) only mounts once for the whole app —
    // client-side navigation between pages doesn't remount it. Re-checking
    // whenever the route changes is what makes the nav update right after a
    // signup/login redirect, instead of only reflecting whatever was true the
    // very first time the app loaded.
    setLoggedIn(Boolean(localStorage.getItem("walletapp_token")));
  }, [pathname]);

  function handleLogout() {
    localStorage.removeItem("walletapp_token");
    window.location.href = "/login";
  }

  if (!loggedIn) return null;

  return (
    <>
      <a href="/dashboard">Dashboard</a>
      <a href="/reports">Reports</a>
      <a href="/insights">Insights</a>
      <span className="spacer" />
      <button type="button" className="link" onClick={handleLogout}>
        Log out
      </button>
    </>
  );
}
