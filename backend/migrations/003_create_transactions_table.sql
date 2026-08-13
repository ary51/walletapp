CREATE TABLE IF NOT EXISTS transactions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- ON DELETE SET NULL, not CASCADE: deleting a category should orphan its
    -- past transactions ("uncategorized"), not delete a user's spending history.
    category_id BIGINT REFERENCES categories(id) ON DELETE SET NULL,

    -- NUMERIC (exact decimal), never FLOAT, for money. Always stored positive;
    -- `type` says which direction it moves the balance.
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    type VARCHAR(10) NOT NULL CHECK (type IN ('income', 'expense')),
    description VARCHAR(255),

    -- The date the purchase/income actually happened, separate from created_at
    -- (when the row was entered, which may be days later).
    transaction_date DATE NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_category_id ON transactions (category_id);

-- Listing a user's transactions ordered by date (the common case) benefits from
-- an index on exactly that pair.
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions (user_id, transaction_date DESC);
