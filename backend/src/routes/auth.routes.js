const express = require("express");
const { body } = require("express-validator");

const { signup, login, me } = require("../controllers/auth.controller");
const { handleValidation } = require("../middleware/validate");
const { requireAuth } = require("../middleware/requireAuth");

const router = express.Router();

router.post(
  "/signup",
  [
    body("email").isEmail().withMessage("Must be a valid email").normalizeEmail(),
    body("password")
      .isLength({ min: 8 })
      .withMessage("Password must be at least 8 characters"),
    body("fullName").trim().notEmpty().withMessage("Full name is required"),
    body("phoneNumber").optional({ checkFalsy: true }).isString(),
  ],
  handleValidation,
  signup
);

router.post(
  "/login",
  [
    body("email").isEmail().withMessage("Must be a valid email").normalizeEmail(),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  handleValidation,
  login
);

// Protected route: proves a JWT issued by /signup or /login actually works.
router.get("/me", requireAuth, me);

module.exports = router;
