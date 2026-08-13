CREATE TABLE IF NOT EXISTS categories (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(10) NOT NULL CHECK (type IN ('income', 'expense')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- One user can't have two categories with the same name, but different
    -- users can both have a "Groceries" category.
    UNIQUE (user_id, name)
);

-- Every query that lists a user's categories filters by user_id, so index it.
CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories (user_id);
