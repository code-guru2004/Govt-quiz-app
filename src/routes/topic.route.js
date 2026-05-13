const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/auth.middleware");
const topicController = require("../controllers/topic.controller");

// ==================== PUBLIC/PROTECTED ROUTES ====================

// Search topics with advanced filtering
router.get("/search", authMiddleware.authMiddleware, topicController.searchTopics);

// Get topics by subject
router.get("/subject/:subjectId", authMiddleware.authMiddleware, topicController.getTopicsBySubject);

// Get topics by category
router.get("/category/:categoryId", authMiddleware.authMiddleware, topicController.getTopicsByCategory);

// Get topics with pagination
router.get("/subject/:subjectId/paginated", authMiddleware.authMiddleware, topicController.getTopicsWithPagination);

// Get topic details by ID
router.get("/:topicId", authMiddleware.authMiddleware, topicController.getTopicDetails);

// Get topic statistics
router.get("/:topicId/statistics", authMiddleware.adminMiddleware, topicController.getTopicStatistics);

// ==================== ADMIN ONLY ROUTES ====================

// Create topic
router.post("/create", authMiddleware.adminMiddleware, topicController.createTopic);

// Update topic (full update)
router.put("/:topicId", authMiddleware.adminMiddleware, topicController.updateTopic);

// Patch topic (partial update)
router.patch("/:topicId", authMiddleware.adminMiddleware, topicController.patchTopic);

// Delete topic (soft or hard delete)
router.delete("/:topicId", authMiddleware.adminMiddleware, topicController.deleteTopic);

// Update topics order
router.put("/order/bulk", authMiddleware.adminMiddleware, topicController.updateTopicsOrder);

// Bulk update topics status
router.patch("/bulk/status", authMiddleware.adminMiddleware, topicController.bulkUpdateTopicsStatus);

module.exports = router;