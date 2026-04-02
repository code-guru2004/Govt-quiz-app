const express = require("express");
const router = express.Router();

const { getAvailableTests, startTest, pauseTest, resumeTest, getAttemptQuestions, saveAnswer, submitTest, getDetailedResult, getLeaderboard } = require("../controllers/user.controller"); 
const authMiddleware = require("../middleware/auth.middleware");

// 🔐 Only logged-in users
router.get("/tests", authMiddleware.authMiddleware, getAvailableTests);

// start test route
router.post("/tests/:testId/start", authMiddleware.authMiddleware, startTest);

// Pause test
router.post("/attempts/:attemptId/pausetest", authMiddleware.authMiddleware, pauseTest);
// resume test
router.get("/attempts/:attemptId/resume", authMiddleware.authMiddleware, resumeTest);

router.get("/attempts/:attemptId", authMiddleware.authMiddleware, getAttemptQuestions);

// save answers route
router.post("/attempts/:attemptId/answer", authMiddleware.authMiddleware, saveAnswer);

// submit test route
router.post("/attempts/:attemptId/submit", authMiddleware.authMiddleware, submitTest);

// detailed result of a test attempt
router.get("/attempts/:attemptId/result", authMiddleware.authMiddleware, getDetailedResult);

// leaderboard route
router.get("/tests/:testId/leaderboard", authMiddleware.authMiddleware, getLeaderboard);
module.exports = router;