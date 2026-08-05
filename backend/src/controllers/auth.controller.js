// bcryptjs, not bcrypt: same API, but pure JavaScript instead of a native module,
// so it doesn't need a C++ compiler toolchain to install — one less thing to fight
// with, especially on Windows.
const bcrypt = require("bcryptjs");
const { pool } = require("../config/db");
const { encrypt, decrypt } = require("../utils/crypto");
const { signToken } = require("../utils/jwt");

const BCRYPT_ROUNDS = 12; // "cost factor" — each +1 roughly doubles the hashing time.
// 12 is a common default in 2026: slow enough that brute-forcing leaked hashes is
// expensive, fast enough that a real login doesn't feel slow (well under 1 second).

// Only these fields ever get sent back to the frontend. Centralizing that here
// means it's impossible to accidentally leak password_hash or the raw encrypted
// phone number by forgetting to strip a field in some route.
function toPublicUser(row) {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
  };
}

async function signup(req, res, next) {
  try {
    const { email, password, fullName, phoneNumber } = req.body;

    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) {
      // 409 Conflict: the request is well-formed, but it collides with existing state.
      return res.status(409).json({ error: "An account with that email already exists" });
    }

    // Never store the plaintext password — only its bcrypt hash. bcrypt generates
    // and embeds a random "salt" into the hash automatically, so two users with the
    // same password still get completely different hashes stored.
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // phoneNumber is optional. Only encrypt/store it if the user actually gave one.
    const phoneNumberEncrypted = phoneNumber ? encrypt(phoneNumber) : null;

    const result = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, phone_number_encrypted)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, full_name, created_at`,
      [email, passwordHash, fullName, phoneNumberEncrypted]
    );

    const user = result.rows[0];
    const token = signToken(user);

    res.status(201).json({ token, user: toPublicUser(user) });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    const result = await pool.query(
      "SELECT id, email, password_hash, full_name FROM users WHERE email = $1",
      [email]
    );

    // Deliberately vague error message on both "no such user" and "wrong password".
    // If we said "no account with that email" vs "wrong password" separately, an
    // attacker could use the API to discover which emails have accounts (an
    // "enumeration" attack) even without ever guessing a correct password.
    const genericError = () => res.status(401).json({ error: "Invalid email or password" });

    if (result.rows.length === 0) {
      return genericError();
    }

    const user = result.rows[0];
    const passwordMatches = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatches) {
      return genericError();
    }

    const token = signToken(user);

    res.json({ token, user: toPublicUser(user) });
  } catch (err) {
    next(err);
  }
}

async function me(req, res, next) {
  try {
    // req.userId was set by the requireAuth middleware after verifying the JWT.
    // Reaching this handler at all proves the token was valid.
    const result = await pool.query(
      "SELECT id, email, full_name, phone_number_encrypted, created_at FROM users WHERE id = $1",
      [req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const row = result.rows[0];
    const user = toPublicUser(row);

    // Demonstrates the decrypt half of the encryption utility: if a phone number
    // was stored, decrypt it back to plaintext just for the account owner.
    if (row.phone_number_encrypted) {
      user.phoneNumber = decrypt(row.phone_number_encrypted);
    }

    res.json({ user });
  } catch (err) {
    next(err);
  }
}

module.exports = { signup, login, me };
