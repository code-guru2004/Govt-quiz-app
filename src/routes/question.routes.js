const express = require("express");
const router = express.Router();
const {
    bulkCreateQuestions
} = require("../controllers/question.controller");
const authMiddleware = require("../middleware/auth.middleware");

router.post(
    "/bulk",
    authMiddleware.adminMiddleware,
    bulkCreateQuestions
  );  //🟢

module.exports = router;