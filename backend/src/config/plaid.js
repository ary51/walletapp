// Sets up the one shared Plaid API client, same idea as the `pool` in db.js —
// one configured client, reused everywhere instead of each file building its own.
//
// Built lazily (only constructed the first time something actually calls
// getPlaidClient(), not the moment this file is require'd) so a server
// without PLAID_CLIENT_ID/PLAID_SECRET configured yet can still boot and
// serve every other route normally — only an actual Plaid request fails,
// with a clear error, instead of the whole app refusing to start.

const { Configuration, PlaidApi, PlaidEnvironments } = require("plaid");

let client = null;

function getPlaidClient() {
  if (client) return client;

  if (!process.env.PLAID_CLIENT_ID || !process.env.PLAID_SECRET) {
    throw Object.assign(
      new Error(
        "PLAID_CLIENT_ID / PLAID_SECRET are not set. Add them to backend/.env — get free Sandbox " +
          "credentials at https://dashboard.plaid.com."
      ),
      { status: 500 }
    );
  }

  // PLAID_ENV picks which of Plaid's environments to talk to. "sandbox" is the
  // free, fake-data mode this whole phase is built around — no real bank ever
  // gets contacted. Plaid also has "development" and "production" environments
  // for later, which need separate approval from Plaid to use.
  const env = process.env.PLAID_ENV || "sandbox";

  const configuration = new Configuration({
    basePath: PlaidEnvironments[env],
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
        "PLAID-SECRET": process.env.PLAID_SECRET,
      },
    },
  });

  client = new PlaidApi(configuration);
  return client;
}

module.exports = { getPlaidClient };
