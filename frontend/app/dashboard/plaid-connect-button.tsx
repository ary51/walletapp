"use client";

import { useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { createPlaidLinkToken, exchangePlaidPublicToken, syncPlaidTransactions } from "@/lib/api";

// Plaid Link is a popup Plaid itself renders and controls (choosing a bank,
// entering credentials) — this component's job is just the handshake around
// it: get a link token from our backend, hand it to Plaid's SDK, and once the
// user finishes, send back what Plaid gives us.
export default function PlaidConnectButton({ onConnected }: { onConnected: () => void }) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "starting" | "linking" | "syncing">("idle");
  const [error, setError] = useState<string | null>(null);

  const { open, ready } = usePlaidLink({
    token: linkToken ?? "",
    onSuccess: async (publicToken) => {
      if (!publicToken) return; // shouldn't happen on a genuine success callback, but keeps TS (and reality) honest
      setStatus("syncing");
      try {
        await exchangePlaidPublicToken(publicToken);
        await syncPlaidTransactions();
        onConnected();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to finish connecting");
      } finally {
        setStatus("idle");
        setLinkToken(null);
      }
    },
    onExit: () => {
      // The user closed the Plaid popup without finishing — not an error,
      // just reset so the button is clickable again.
      setStatus("idle");
      setLinkToken(null);
    },
  });

  // usePlaidLink only becomes `ready` once it has a real token and Plaid's
  // script has loaded, which happens asynchronously after setLinkToken below
  // — so opening it has to happen here, reacting to `ready`, rather than
  // right after the fetch that sets the token.
  useEffect(() => {
    if (ready && linkToken && status === "starting") {
      setStatus("linking");
      open();
    }
  }, [ready, linkToken, status, open]);

  async function handleClick() {
    setError(null);
    setStatus("starting");
    try {
      const { linkToken: token } = await createPlaidLinkToken();
      setLinkToken(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start bank connection");
      setStatus("idle");
    }
  }

  const labels: Record<typeof status, string> = {
    idle: "Connect a bank account",
    starting: "Starting…",
    linking: "Waiting for Plaid…",
    syncing: "Importing transactions…",
  };

  return (
    <div>
      <button type="button" onClick={handleClick} disabled={status !== "idle"}>
        {labels[status]}
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
