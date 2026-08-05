// express-validator lets each route declare its own rules (see auth.routes.js),
// e.g. body("email").isEmail(). This middleware is the shared last step: it checks
// whether any of those rules failed and, if so, responds with 400 before the
// request ever reaches the controller. This keeps "is the input well-formed"
// separate from "what does this route actually do."

const { validationResult } = require("express-validator");

function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: "Invalid input", details: errors.array() });
  }
  next();
}

module.exports = { handleValidation };
