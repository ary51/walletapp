// Protects routes that should only work for a logged-in user. The frontend sends
// the JWT it got from /login or /signup in the Authorization header, formatted as
// "Bearer <token>". This middleware checks that header is present and the token
// is valid, then attaches the user's id to `req.userId` so the route handler
// doesn't have to re-verify anything.

const { verifyToken } = require("../utils/jwt");

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Missing or malformed Authorization header" });
  }

  try {
    const payload = verifyToken(token);
    req.userId = payload.sub;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

module.exports = { requireAuth };
