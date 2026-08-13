const express = require("express");
const { body, param, query } = require("express-validator");

const { list, create, update, remove } = require("../controllers/budgets.controller");
const { handleValidation } = require("../middleware/validate");
const { requireAuth } = require("../middleware/requireAuth");

const router = express.Router();

router.use(requireAuth);

const MONTH_FORMAT = /^\d{4}-\d{2}(-\d{2})?$/;

router.get(
  "/",
  [query("month").optional().matches(MONTH_FORMAT).withMessage("month must be in YYYY-MM format")],
  handleValidation,
  list
);

router.post(
  "/",
  [
    body("categoryId").isInt().withMessage("categoryId is required"),
    body("month").matches(MONTH_FORMAT).withMessage("month must be in YYYY-MM format"),
    body("amount").isFloat({ gt: 0 }).withMessage("Amount must be a positive number"),
  ],
  handleValidation,
  create
);

router.put(
  "/:id",
  [
    param("id").isInt().withMessage("Invalid budget id"),
    body("amount").isFloat({ gt: 0 }).withMessage("Amount must be a positive number"),
  ],
  handleValidation,
  update
);

router.delete("/:id", [param("id").isInt().withMessage("Invalid budget id")], handleValidation, remove);

module.exports = router;
