const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/auth.middleware");
const testController = require("../controllers/test.controller");

// create a new test- admin only
router.post("/draft", authMiddleware.adminMiddleware, testController.createTest);  //DONE 🟢
// get template
router.get("/templates",authMiddleware.adminMiddleware, testController.getAllTemplates);  //DONE🟢

// get test deatils
router.get("/:testId/details",authMiddleware.authMiddleware,testController.getTestDetails);  //DONE
// add questions to a test- admin only
router.post("/:testId/questions", authMiddleware.adminMiddleware, testController.addQuestionsToTest);  //DONE

router.delete("/:testId/questions", authMiddleware.adminMiddleware, testController.removeQuestionsFromTest);  //DONE
router.put("/:testId/questions/reorder", authMiddleware.adminMiddleware, testController.reorderQuestions);  //DONE
router.get("/:testId/questions", authMiddleware.authMiddleware, testController.getTestQuestions);
router.get("/", authMiddleware.authMiddleware, testController.getAllTests);   
router.get("/:testId", authMiddleware.authMiddleware, testController.getTestById);  //🟢
// old endpoints (need refactoring)
// get all tests by subject and topic- for everyone
router.get("/subject/:subjectId/topic/:topicId", authMiddleware.authMiddleware, testController.getTestsByTopicAndSubject); //DONE
//subject wise test list
router.get("/subject/:subjectId", authMiddleware.authMiddleware, testController.getTestsBySubject);  //DONE
// get all attempts
router.get("/:testId/attempts", authMiddleware.authMiddleware, testController.getAttemptsByTest); //DONE

// delete test by id---admin only
router.delete("/:testId", authMiddleware.adminMiddleware, testController.deleteTestById); //🟢

// get full-length tests with filters and user attempt status
router.get("/full-length", authMiddleware.authMiddleware, testController.getFullLengthTests);
router.get("/full-length/featured",authMiddleware.authMiddleware, testController.getFeaturedFullLengthTests);
router.get("/full-length/filters/options",authMiddleware.authMiddleware, testController.getTestFilterOptions);
router.get("/full-length/:testId", authMiddleware.authMiddleware, testController.getFullLengthTestById);

module.exports = router;