const { getPlaidClient } = require("../config/plaid");
const { pool } = require("../config/db");
const { encrypt, decrypt } = require("../utils/crypto");

// Step 1 of Plaid Link: the frontend needs a short-lived "link token" before
// it can even open the Plaid Link popup. This is Plaid's way of tying that
// popup session back to a specific one of our users and our app's
// credentials, without the frontend ever touching PLAID_SECRET directly.
async function createLinkToken(req, res, next) {
  try {
    const plaidClient = getPlaidClient();
    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: String(req.userId) },
      client_name: "walletapp",
      products: ["transactions"],
      country_codes: ["US"],
      language: "en",
    });

    res.json({ linkToken: response.data.link_token });
  } catch (err) {
    next(err);
  }
}

// Step 2: after the user finishes the Plaid Link popup (picks a sandbox bank,
// enters test credentials), the frontend gets back a short-lived
// `public_token` and sends it here. This exchanges it for the real,
// long-lived `access_token` — the only thing that can actually fetch this
// connection's account/transaction data going forward.
async function exchangePublicToken(req, res, next) {
  try {
    const plaidClient = getPlaidClient();
    const { publicToken } = req.body;

    const exchange = await plaidClient.itemPublicTokenExchange({ public_token: publicToken });
    const accessToken = exchange.data.access_token;
    const itemId = exchange.data.item_id;

    // Institution name is just for display ("Chase Sandbox Bank" instead of a
    // raw item id) — fetched separately and best-effort, since a failure here
    // shouldn't block the actual bank connection from being saved.
    let institutionName = null;
    try {
      const item = await plaidClient.itemGet({ access_token: accessToken });
      const institutionId = item.data.item.institution_id;
      if (institutionId) {
        const institution = await plaidClient.institutionsGetById({
          institution_id: institutionId,
          country_codes: ["US"],
        });
        institutionName = institution.data.institution.name;
      }
    } catch {
      // Non-critical — proceed without a display name rather than failing
      // the whole connection over it.
    }

    const accountsResponse = await plaidClient.accountsGet({ access_token: accessToken });

    // Saving the item and all of its accounts together should be
    // all-or-nothing, same reasoning as the user+categories transaction in
    // auth.controller.js's signup.
    const client = await pool.connect();
    let plaidItemId;
    try {
      await client.query("BEGIN");

      const itemResult = await client.query(
        `INSERT INTO plaid_items (user_id, item_id, access_token_encrypted, institution_name)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [req.userId, itemId, encrypt(accessToken), institutionName]
      );
      plaidItemId = itemResult.rows[0].id;

      for (const account of accountsResponse.data.accounts) {
        await client.query(
          `INSERT INTO plaid_accounts (plaid_item_id, account_id, name, mask, type, subtype)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [plaidItemId, account.account_id, account.name, account.mask, account.type, account.subtype]
        );
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    res.status(201).json({ plaidItemId, institutionName });
  } catch (err) {
    next(err);
  }
}

// Converts one Plaid transaction into the shape our `transactions` table
// expects. Plaid's amount convention is the opposite of a sign-free
// intuition: positive = money leaving the account (an expense), negative =
// money coming in (income) — refunds, deposits, direct payroll deposits, etc.
function mapPlaidAmount(plaidAmount) {
  if (plaidAmount > 0) return { type: "expense", amount: plaidAmount };
  if (plaidAmount < 0) return { type: "income", amount: Math.abs(plaidAmount) };
  return null; // a $0 transaction (e.g. a canceled auth hold) isn't worth storing — our amount CHECK requires > 0 anyway
}

async function syncOneItem(item) {
  const plaidClient = getPlaidClient();
  const accessToken = decrypt(item.access_token_encrypted);

  const accountsResult = await pool.query("SELECT id, account_id FROM plaid_accounts WHERE plaid_item_id = $1", [
    item.id,
  ]);
  const accountIdMap = new Map(accountsResult.rows.map((row) => [row.account_id, row.id]));

  let cursor = item.cursor || undefined;
  let hasMore = true;
  const added = [];
  const modified = [];
  const removed = [];

  // /transactions/sync is paginated (`has_more`) — a connection with a lot of
  // history can require several calls to fully catch up.
  while (hasMore) {
    const response = await plaidClient.transactionsSync({ access_token: accessToken, cursor });
    added.push(...response.data.added);
    modified.push(...response.data.modified);
    removed.push(...response.data.removed);
    hasMore = response.data.has_more;
    cursor = response.data.next_cursor;
  }

  const client = await pool.connect();
  let importedCount = 0;
  try {
    await client.query("BEGIN");

    for (const tx of [...added, ...modified]) {
      if (tx.pending) continue; // the posted version will arrive in a later sync once it clears
      const mapped = mapPlaidAmount(tx.amount);
      if (!mapped) continue;

      await client.query(
        `INSERT INTO transactions
           (user_id, category_id, amount, type, description, transaction_date, source, plaid_transaction_id, plaid_account_id)
         VALUES ($1, NULL, $2, $3, $4, $5, 'plaid', $6, $7)
         ON CONFLICT (plaid_transaction_id)
         DO UPDATE SET amount = EXCLUDED.amount, type = EXCLUDED.type,
                        description = EXCLUDED.description, transaction_date = EXCLUDED.transaction_date,
                        updated_at = now()`,
        [
          item.user_id,
          mapped.amount,
          mapped.type,
          tx.merchant_name || tx.name,
          tx.date,
          tx.transaction_id,
          accountIdMap.get(tx.account_id) || null,
        ]
      );
      importedCount += 1;
    }

    for (const tx of removed) {
      await client.query("DELETE FROM transactions WHERE plaid_transaction_id = $1", [tx.transaction_id]);
    }

    await client.query(
      "UPDATE plaid_items SET cursor = $1, updated_at = now() WHERE id = $2",
      [cursor, item.id]
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return { importedCount, removedCount: removed.length };
}

async function sync(req, res, next) {
  try {
    const items = await pool.query(
      "SELECT id, user_id, access_token_encrypted, cursor FROM plaid_items WHERE user_id = $1",
      [req.userId]
    );

    if (items.rows.length === 0) {
      return res.json({ synced: 0, imported: 0 });
    }

    let imported = 0;
    for (const item of items.rows) {
      const result = await syncOneItem(item);
      imported += result.importedCount;
    }

    res.json({ synced: items.rows.length, imported });
  } catch (err) {
    next(err);
  }
}

async function listItems(req, res, next) {
  try {
    const items = await pool.query(
      `SELECT
         pi.id,
         pi.institution_name,
         pi.created_at,
         COALESCE(
           json_agg(
             json_build_object('name', pa.name, 'mask', pa.mask, 'subtype', pa.subtype)
           ) FILTER (WHERE pa.id IS NOT NULL),
           '[]'
         ) AS accounts
       FROM plaid_items pi
       LEFT JOIN plaid_accounts pa ON pa.plaid_item_id = pi.id
       WHERE pi.user_id = $1
       GROUP BY pi.id
       ORDER BY pi.created_at DESC`,
      [req.userId]
    );

    res.json({ items: items.rows });
  } catch (err) {
    next(err);
  }
}

async function removeItem(req, res, next) {
  try {
    const result = await pool.query(
      "SELECT access_token_encrypted FROM plaid_items WHERE id = $1 AND user_id = $2",
      [req.params.id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Linked account not found" });
    }

    // Tell Plaid itself to tear down the connection, not just our own copy of
    // it — otherwise it stays "connected" from Plaid's side indefinitely.
    try {
      await getPlaidClient().itemRemove({ access_token: decrypt(result.rows[0].access_token_encrypted) });
    } catch {
      // Proceed with local cleanup even if Plaid's side fails (e.g. it was
      // already removed) — the user's intent is clear either way.
    }

    // ON DELETE CASCADE removes plaid_accounts; transactions imported from
    // this connection keep their spending history, just with
    // plaid_account_id set back to NULL (ON DELETE SET NULL) instead of
    // being deleted.
    await pool.query("DELETE FROM plaid_items WHERE id = $1 AND user_id = $2", [req.params.id, req.userId]);

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { createLinkToken, exchangePublicToken, sync, listItems, removeItem };
