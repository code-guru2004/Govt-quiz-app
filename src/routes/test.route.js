const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/auth.middleware");
const testController = require("../controllers/test.controller");
// get all tests by subject and topic- for everyone
router.get("/subject/:subjectId/topic/:topicId", authMiddleware.authMiddleware, testController.getTestsByTopicAndSubject);
//subject wise test list
router.get("/subject/:subjectId", authMiddleware.authMiddleware, testController.getTestsBySubject); 
// get all attempts
router.get("/:testId/attempts", authMiddleware.authMiddleware, testController.getAttemptsByTest);

// get full-length tests with filters and user attempt status
router.get("/full-length", authMiddleware.authMiddleware, testController.getFullLengthTests);
router.get("/full-length/featured",authMiddleware.authMiddleware, testController.getFeaturedFullLengthTests);
router.get("/full-length/filters/options",authMiddleware.authMiddleware, testController.getTestFilterOptions);
router.get("/full-length/:testId", authMiddleware.authMiddleware, testController.getFullLengthTestById);

module.exports = router;