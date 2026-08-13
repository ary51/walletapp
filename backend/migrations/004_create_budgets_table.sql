CREATE TABLE IF NOT EXISTS budgets (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id BIGINT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,

    -- Always the 1st of the month (e.g. 2026-08-01), enforced below, so "this
    -- month's budgets" is a plain equality/range check instead of needing to
    -- parse or compare partial dates.
    month DATE NOT NULL,
    CHECK (EXTRACT(DAY FROM month) = 1),

    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- One budget per category per month — no duplicates.
    UNIQUE (user_id, category_id, month)
);

CREATE INDEX IF NOT EXISTS idx_budgets_user_month ON budgets (user_id, month);
