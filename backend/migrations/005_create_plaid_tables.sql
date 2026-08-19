-- One row per bank connection a user makes through Plaid Link.
CREATE TABLE IF NOT EXISTS plaid_items (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Plaid's own identifier for this connection. Unique because the same
    -- bank connection should never be stored twice.
    item_id TEXT NOT NULL UNIQUE,

    -- The long-lived credential Plaid gives us to fetch this connection's
    -- data going forward. Same reasoning as phone_number_encrypted on users:
    -- this is effectively a key to someone's real bank data (in Sandbox,
    -- fake data) and must never sit in the database as plain text.
    access_token_encrypted TEXT NOT NULL,

    institution_name TEXT,

    -- Plaid's /transactions/sync is cursor-based: each sync call returns a
    -- cursor to pass into the *next* call so Plaid only sends what changed
    -- since last time, instead of the user's whole transaction history every
    -- time. NULL means "never synced yet."
    cursor TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plaid_items_user_id ON plaid_items (user_id);

-- One row per bank account within a connection (a single bank login can
-- expose multiple accounts: checking, savings, credit card, ...).
CREATE TABLE IF NOT EXISTS plaid_accounts (
    id BIGSERIAL PRIMARY KEY,
    plaid_item_id BIGINT NOT NULL REFERENCES plaid_items(id) ON DELETE CASCADE,

    account_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    mask VARCHAR(4),
    type VARCHAR(30),
    subtype VARCHAR(30),

    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plaid_accounts_item_id ON plaid_accounts (plaid_item_id);

-- Extend the existing transactions table so Plaid-imported rows can live
-- alongside manually-entered ones in the same list.
ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS source VARCHAR(10) NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'plaid')),
    ADD COLUMN IF NOT EXISTS plaid_transaction_id TEXT UNIQUE,
    ADD COLUMN IF NOT EXISTS plaid_account_id BIGINT REFERENCES plaid_accounts(id) ON DELETE SET NULL;

-- plaid_transaction_id being UNIQUE is what makes a sync idempotent: if the
-- same Plaid transaction is synced twice (e.g. the app is closed mid-sync and
-- resumes from an old cursor), inserting it again is rejected as a duplicate
-- instead of creating a second copy of the same purchase.
