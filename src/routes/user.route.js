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
router.post("/tests/:testId/start", authMiddleware.authMiddleware, startTest);   //DONE

// Pause test
router.post("/attempts/:attemptId/pausetest", authMiddleware.authMiddleware, pauseTest);  //DONE
// resume test
router.get("/attempts/:attemptId/resume", authMiddleware.authMiddleware, resumeTest);  //DONE

// get questions for an attempt
router.get("/attempts/:attemptId", authMiddleware.authMiddleware, getAttemptQuestions);  //DONE

// save answers route
router.post("/attempts/:attemptId/answer", authMiddleware.authMiddleware, saveAnswer);  //DONE

// submit test route
router.post("/attempts/:attemptId/submit", authMiddleware.authMiddleware, submitTest);   //DONE

// detailed result of a test attempt
router.get("/attempts/:attemptId/result", authMiddleware.authMiddleware, getDetailedResult);   //DONE

// leaderboard route
router.get("/tests/:testId/leaderboard", authMiddleware.authMiddleware, getLeaderboard);  //DONE

// get all published tests
router.get("/tests/published", authMiddleware.authMiddleware, getPublishedTests);

// get test by id
router.get("/test/:testId", authMiddleware.authMiddleware, getTestById);  //DONE

// get List all results (lightweight)
router.get("/results", authMiddleware.authMiddleware, getMyResults); //DONE
router.get("/dashboard", authMiddleware.authMiddleware, getUserDashboard);        // Complete dashboard  //done
router.get("/profile", authMiddleware.authMiddleware, getUserProfile);             // Simple profile
router.put("/profile", authMiddleware.authMiddleware, updateUserProfile);          // Update profile
router.get("/test-history", authMiddleware.authMiddleware, getUserTestHistory);    // Paginated test history
router.get("/stats", authMiddleware.authMiddleware, getUserStats);                 // Quick stats
// change password
router.put("/change-password",authMiddleware.authMiddleware, changePassword); //DONE


// GET remaining time for an attempt
router.get("/attempts/:attemptId/remaining-time", authMiddleware.authMiddleware, getRemainingTime)
module.exports = router;