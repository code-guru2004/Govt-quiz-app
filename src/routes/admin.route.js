const express = require("express");
const router = express.Router();

const { createQuestion, makeTestStateChange, getQuestions, getAllTests, getIndividualTestDetails,removeQuestionFromTest,getDashboardStats  } = require("../controllers/admin.controller");

const {
  getAllUsers,
  getUserDetails,
  updateUserRole,
  deleteUser,
  getUserStatistics
} = require("../controllers/userManagement.controller");
const authMiddleware = require("../middleware/auth.middleware");

// 🔥 Only admin can access
router.post(
  "/questions",
  authMiddleware.adminMiddleware,
  createQuestion
); //🟢

// // craete a new test
// router.post(
//     "/tests",
//     authMiddleware.adminMiddleware,
//     createTest
//   );

//   // add questions to test
// router.post(
//     "/tests/:testId/questions",
//     authMiddleware.adminMiddleware,
//     addQuestionsToTest
//   );

router.post(
    "/tests/:testId/change-state",
    authMiddleware.adminMiddleware,
    makeTestStateChange
  ); //🟢

  // get all questions with filters for admin panel
  router.get(
    "/get-questions",
    authMiddleware.adminMiddleware,
    getQuestions
  );  // 🟢

  router.get(
    "/tests",
    authMiddleware.adminMiddleware,
    getAllTests
  );  //🟢

  // get individual test details
  router.get(
    "/tests/:testId", 
    authMiddleware.adminMiddleware,
    getIndividualTestDetails
  );  //🟢

  router.delete(
    "/tests/:testId/questions/:questionId",
    authMiddleware.adminMiddleware,
    removeQuestionFromTest
  ); //🟢

  router.get(
    "/dashboard-stats",
    authMiddleware.adminMiddleware,
    getDashboardStats
  );   // 🟢


  // User Management Routes
router.get("/users/statistics", authMiddleware.adminMiddleware, getUserStatistics);//🟢
router.get("/users",authMiddleware.adminMiddleware, getAllUsers);//🟢
router.get("/users/:userId",authMiddleware.adminMiddleware, getUserDetails); //🟢
router.put("/users/:userId/role", authMiddleware.adminMiddleware, updateUserRole);//🟢
router.delete("/users/:userId", authMiddleware.adminMiddleware, deleteUser);//🟢

module.exports = router;