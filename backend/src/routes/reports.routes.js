const express = require("express");
const { query } = require("express-validator");

const { spendingByCategory, monthlyTrend } = require("../controllers/reports.controller");
const { handleValidation } = require("../middleware/validate");
const { requireAuth } = require("../middleware/requireAuth");

const router = express.Router();

router.use(requireAuth);

const MONTH_FORMAT = /^\d{4}-\d{2}(-\d{2})?$/;

router.get(
  "/spending-by-category",
  [query("month").optional().matches(MONTH_FORMAT).withMessage("month must be in YYYY-MM format")],
  handleValidation,
  spendingByCategory
);

router.get(
  "/monthly-trend",
  [query("months").optional().isInt({ min: 1, max: 24 })],
  handleValidation,
  monthlyTrend
);

module.exports = router;
