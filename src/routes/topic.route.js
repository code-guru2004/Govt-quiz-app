const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/auth.middleware");
const topicController = require("../controllers/topic.controller");
// search topics by name - for everyone
router.get("/search",authMiddleware.authMiddleware, topicController.searchTopics);
// create topic - only admin
router.post("/create",authMiddleware.adminMiddleware, topicController.createTopic);
// get all topics of a subject - for everyone
router.get("/subject/:subjectId",authMiddleware.authMiddleware, topicController.getTopicsBySubject);

module.exports = router;