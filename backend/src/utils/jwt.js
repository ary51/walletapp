// Wraps the `jsonwebtoken` package so the rest of the app never touches JWT_SECRET
// directly.
//
// What a JWT actually is: a signed, base64-encoded blob of JSON. It is NOT
// encrypted — anyone can decode it and read the contents (try pasting one into
// jwt.io). The signature is what matters: it proves the token was issued by our
// server and hasn't been edited since, because producing a valid signature requires
// JWT_SECRET, which only the server knows. That's why we only ever put non-secret
// identifiers in the payload (here, just the user's id) — never a password, never
// anything you wouldn't want a curious user to read.
//
// Why JWTs instead of, say, storing sessions in the database? A JWT is
// self-contained: the server can verify "is this request really from user 42"
// using nothing but the token and JWT_SECRET, with no database lookup and no
// server-side session storage. That statelessness is exactly what makes JWTs
// convenient for a REST API with a separate frontend.

const jwt = require("jsonwebtoken");

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is not set. Add it to backend/.env.");
}

const EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

/**
 * Issues a signed JWT for a given user.
 * @param {{ id: number }} user
 * @returns {string} the JWT
 */
function signToken(user) {
  return jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { expiresIn: EXPIRES_IN });
}

/**
 * Verifies a JWT and returns its decoded payload, or throws if it's invalid/expired.
 * @param {string} token
 */
function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

module.exports = { signToken, verifyToken };
