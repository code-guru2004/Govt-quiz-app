// leaderboardRoutes.js
const express = require("express");
const router = express.Router();
const {
  getLeaderboard,
  getWeightedLeaderboard,
  getUserRank
} = require("../controllers/leaderboard.controller");
const authMiddleware = require("../middleware/auth.middleware");

// Public routes (or protected based on your requirement)
router.get("/",authMiddleware.authMiddleware, getLeaderboard);
router.get("/weighted",authMiddleware.authMiddleware, getWeightedLeaderboard);
router.get("/user/:userId",authMiddleware.authMiddleware, getUserRank);

module.exports = router;