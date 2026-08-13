const express = require("express");
const { body, param } = require("express-validator");

const { list, create, update, remove } = require("../controllers/categories.controller");
const { handleValidation } = require("../middleware/validate");
const { requireAuth } = require("../middleware/requireAuth");

const router = express.Router();

// Every route below requires a valid JWT. router.use runs requireAuth in front
// of everything defined after it in this file, so there's no need to repeat it
// on each individual route.
router.use(requireAuth);

router.get("/", list);

router.post(
  "/",
  [
    body("name").trim().notEmpty().withMessage("Name is required"),
    body("type").isIn(["income", "expense"]).withMessage("Type must be 'income' or 'expense'"),
  ],
  handleValidation,
  create
);

router.put(
  "/:id",
  [
    param("id").isInt().withMessage("Invalid category id"),
    body("name").optional().trim().notEmpty().withMessage("Name cannot be blank"),
    body("type").optional().isIn(["income", "expense"]).withMessage("Type must be 'income' or 'expense'"),
  ],
  handleValidation,
  update
);

router.delete("/:id", [param("id").isInt().withMessage("Invalid category id")], handleValidation, remove);

module.exports = router;
