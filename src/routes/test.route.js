const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/auth.middleware");
const testController = require("../controllers/test.controller");
// get all tests by subject and topic- for everyone
router.get("/subject/:subjectId/topic/:topicId", authMiddleware.authMiddleware, testController.getTestsByTopicAndSubject);
//subject wise test list
router.get("/subject/:subjectId", authMiddleware.authMiddleware, testController.getTestsBySubject); 
module.exports = router;