const express = require("express");
const router = express.Router();

const { createQuestion, createTest, addQuestionsToTest, makeTestActive, getQuestions, getAllTests, getIndividualTestDetails  } = require("../controllers/admin.controller");
const authMiddleware = require("../middleware/auth.middleware");

// 🔥 Only admin can access
router.post(
  "/questions",
  authMiddleware.adminMiddleware,
  createQuestion
);

// craete a new test
router.post(
    "/tests",
    authMiddleware.adminMiddleware,
    createTest
  );

  // add questions to test
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

  // get individual test details
  router.get(
    "/tests/:testId", 
    authMiddleware.adminMiddleware,
    getIndividualTestDetails
  );
module.exports = router;