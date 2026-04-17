const express = require("express");
const router = express.Router();

const { getAvailableTests,
    startTest,
    pauseTest,
    resumeTest,
    getAttemptQuestions,
    saveAnswer,
    submitTest,
    getDetailedResult,
    getLeaderboard,
    getPublishedTests,
    getTestById,
    getMyResults,
    getUserDashboard,
    getUserProfile,
    updateUserProfile,
    getUserTestHistory,
    getUserStats,
    changePassword,
    getRemainingTime
} = require("../controllers/user.controller");
const authMiddleware = require("../middleware/auth.middleware");

// 🔐 Only logged-in users
router.get("/tests", authMiddleware.authMiddleware, getAvailableTests);

// start test route
router.post("/tests/:testId/start", authMiddleware.authMiddleware, startTest);

// Pause test
router.post("/attempts/:attemptId/pausetest", authMiddleware.authMiddleware, pauseTest);
// resume test
router.get("/attempts/:attemptId/resume", authMiddleware.authMiddleware, resumeTest);

// get questions for an attempt
router.get("/attempts/:attemptId", authMiddleware.authMiddleware, getAttemptQuestions);

// save answers route
router.post("/attempts/:attemptId/answer", authMiddleware.authMiddleware, saveAnswer);

// submit test route
router.post("/attempts/:attemptId/submit", authMiddleware.authMiddleware, submitTest);

// detailed result of a test attempt
router.get("/attempts/:attemptId/result", authMiddleware.authMiddleware, getDetailedResult);

// leaderboard route
router.get("/tests/:testId/leaderboard", authMiddleware.authMiddleware, getLeaderboard);

// get all published tests
router.get("/tests/published", authMiddleware.authMiddleware, getPublishedTests);

// get test by id
router.get("/test/:testId", authMiddleware.authMiddleware, getTestById);

// get List all results (lightweight)
router.get("/results", authMiddleware.authMiddleware, getMyResults);
router.get("/dashboard", authMiddleware.authMiddleware, getUserDashboard);        // Complete dashboard
router.get("/profile", authMiddleware.authMiddleware, getUserProfile);             // Simple profile
router.put("/profile", authMiddleware.authMiddleware, updateUserProfile);          // Update profile
router.get("/test-history", authMiddleware.authMiddleware, getUserTestHistory);    // Paginated test history
router.get("/stats", authMiddleware.authMiddleware, getUserStats);                 // Quick stats
// change password
router.put("/change-password",authMiddleware.authMiddleware, changePassword);


// GET remaining time for an attempt
router.get("/attempts/:attemptId/remaining-time", authMiddleware.authMiddleware, getRemainingTime)
module.exports = router;