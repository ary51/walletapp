const express = require("express");
const { body, param, query } = require("express-validator");

const { list, create, update, remove } = require("../controllers/transactions.controller");
const { handleValidation } = require("../middleware/validate");
const { requireAuth } = require("../middleware/requireAuth");

const router = express.Router();

router.use(requireAuth);

router.get(
  "/",
  [
    query("type").optional().isIn(["income", "expense"]),
    query("categoryId").optional().isInt(),
  ],
  handleValidation,
  list
);

const transactionBodyRules = [
  body("amount").isFloat({ gt: 0 }).withMessage("Amount must be a positive number"),
  body("type").isIn(["income", "expense"]).withMessage("Type must be 'income' or 'expense'"),
  body("description").optional({ checkFalsy: true }).trim().isLength({ max: 255 }),
  body("transactionDate").isISO8601().withMessage("transactionDate must be a valid date (YYYY-MM-DD)"),
  body("categoryId").optional({ checkFalsy: true }).isInt().withMessage("Invalid categoryId"),
];

router.post("/", transactionBodyRules, handleValidation, create);

router.put(
  "/:id",
  [
    param("id").isInt().withMessage("Invalid transaction id"),
    body("amount").optional().isFloat({ gt: 0 }),
    body("type").optional().isIn(["income", "expense"]),
    body("description").optional({ checkFalsy: true }).trim().isLength({ max: 255 }),
    body("transactionDate").optional().isISO8601(),
    body("categoryId").optional({ checkFalsy: true }).isInt(),
  ],
  handleValidation,
  update
);

router.delete("/:id", [param("id").isInt().withMessage("Invalid transaction id")], handleValidation, remove);

module.exports = router;
