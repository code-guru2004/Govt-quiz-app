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

router.get('/:topicId', authMiddleware.authMiddleware, topicController.getTopicDetails);
router.put('/:topicId', authMiddleware.authMiddleware, topicController.updateTopic);
router.patch('/:topicId', authMiddleware.authMiddleware, topicController.patchTopic);
router.delete('/:topicId', authMiddleware.authMiddleware, topicController.deleteTopic);
router.put('/order/bulk', authMiddleware.authMiddleware, topicController.updateTopicsOrder);
router.get('/subject/:subjectId/paginated', authMiddleware.authMiddleware, topicController.getTopicsWithPagination);


module.exports = router;