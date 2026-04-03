const express = require("express");
const router = express.Router();

const { createQuestion, createTest, addQuestionsToTest, makeTestActive, getQuestions, getAllTests  } = require("../controllers/admin.controller");
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

  router.get(
    "/get-questions",
    authMiddleware.adminMiddleware,
    getQuestions
  );

  router.get(
    "/tests",
    authMiddleware.adminMiddleware,
    getAllTests
  );
module.exports = router;