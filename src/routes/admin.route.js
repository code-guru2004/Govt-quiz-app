const express = require("express");
const router = express.Router();

const { createQuestion, createTest, addQuestionsToTest, makeTestActive  } = require("../controllers/admin.controller");
const authMiddleware = require("../middleware/auth.middleware");

// 🔥 Only admin can access
router.post(
  "/questions",
  authMiddleware.adminMiddleware,
  createQuestion
);

router.post(
    "/tests",
    authMiddleware.adminMiddleware,
    createTest
  );

router.post(
    "/tests/:testId/questions",
    authMiddleware.adminMiddleware,
    addQuestionsToTest
  );

router.post(
    "/tests/:testId/activate",
    authMiddleware.adminMiddleware,
    makeTestActive
  );
module.exports = router;