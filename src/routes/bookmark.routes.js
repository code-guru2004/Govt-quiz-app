// bookmarkRoutes.js
const express = require("express");
const router = express.Router();
const {
  addBookmark,
  removeBookmark,
  getBookmarks,
  isBookmarked
} = require("../controllers/bookmarkController");
const authMiddleware = require("../middleware/auth.middleware");

router.get("/",authMiddleware.authMiddleware, getBookmarks);
router.get("/:testId/check",authMiddleware.authMiddleware, isBookmarked);
router.post("/:testId",authMiddleware.authMiddleware, addBookmark);
router.delete("/:testId",authMiddleware.authMiddleware, removeBookmark);

module.exports = router;