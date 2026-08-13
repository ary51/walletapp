const { pool } = require("../config/db");

// Every query in this file includes `AND user_id = $...`. That's not optional
// decoration — it's what stops user A from reading, editing, or deleting user
// B's categories just by guessing an id in the URL. There's no separate
// "check ownership" step; ownership is baked directly into the query itself,
// so it's impossible to forget.

async function list(req, res, next) {
  try {
    const result = await pool.query(
      "SELECT id, name, type, created_at FROM categories WHERE user_id = $1 ORDER BY type, name",
      [req.userId]
    );
    res.json({ categories: result.rows });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { name, type } = req.body;

    const result = await pool.query(
      `INSERT INTO categories (user_id, name, type)
       VALUES ($1, $2, $3)
       RETURNING id, name, type, created_at`,
      [req.userId, name, type]
    );

    res.status(201).json({ category: result.rows[0] });
  } catch (err) {
    // Postgres error code 23505 = unique_violation. This fires if the user
    // already has a category with this exact name (the UNIQUE(user_id, name)
    // constraint from the migration). Translate it into a friendly 409 instead
    // of a raw 500.
    if (err.code === "23505") {
      return res.status(409).json({ error: "You already have a category with that name" });
    }
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const { name, type } = req.body;

    const result = await pool.query(
      `UPDATE categories
       SET name = COALESCE($1, name), type = COALESCE($2, type)
       WHERE id = $3 AND user_id = $4
       RETURNING id, name, type, created_at`,
      [name ?? null, type ?? null, req.params.id, req.userId]
    );

    if (result.rows.length === 0) {
      // Deliberately the same 404 whether the category doesn't exist at all,
      // or exists but belongs to someone else — either way, this user
      // shouldn't be able to tell the difference.
      return res.status(404).json({ error: "Category not found" });
    }

    res.json({ category: result.rows[0] });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "You already have a category with that name" });
    }
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const result = await pool.query(
      "DELETE FROM categories WHERE id = $1 AND user_id = $2 RETURNING id",
      [req.params.id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Category not found" });
    }

    // 204 No Content: the delete worked, there's nothing meaningful to send back.
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, update, remove };
