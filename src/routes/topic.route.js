const express = require("express");
const router = express.Router();



const authMiddleware = require("../middleware/auth.middleware");
const topicController = require("../controllers/topic.controller");

router.get("/search",authMiddleware.authMiddleware, topicController.searchTopics);
router.post("/create",authMiddleware.adminMiddleware, topicController.createTopic);

module.exports = router;