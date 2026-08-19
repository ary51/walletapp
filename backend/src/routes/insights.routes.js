const express = require("express");
const { param, query } = require("express-validator");

const {
  spendingSummary,
  budgetRecommendations,
  anomalies,
  explainTransaction,
} = require("../controllers/insights.controller");
const { handleValidation } = require("../middleware/validate");
const { requireAuth } = require("../middleware/requireAuth");

const router = express.Router();

router.use(requireAuth);

const MONTH_FORMAT = /^\d{4}-\d{2}(-\d{2})?$/;

router.get(
  "/summary",
  [query("month").optional().matches(MONTH_FORMAT).withMessage("month must be in YYYY-MM format")],
  handleValidation,
  spendingSummary
);

router.get("/budget-recommendations", budgetRecommendations);

router.get(
  "/anomalies",
  [query("month").optional().matches(MONTH_FORMAT).withMessage("month must be in YYYY-MM format")],
  handleValidation,
  anomalies
);

router.post(
  "/explain/:id",
  [param("id").isInt().withMessage("Invalid transaction id")],
  handleValidation,
  explainTransaction
);

module.exports = router;
