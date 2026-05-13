// routes/categoryRoutes.js
const express = require("express");
const router = express.Router();
const {
  createCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
  getCategoryHierarchy,
  getCategorySubjects,
  bulkUpdateCategoryStatus,
  reorderCategories
} = require("../controllers/category.controller");

// Middleware for authentication (if you have it)
const authMiddleware = require("../middleware/auth.middleware");

// Public routes
router.get("/", getAllCategories);
router.get("/hierarchy", getCategoryHierarchy);
router.get("/:id", getCategoryById);
router.get("/:id/subjects", getCategorySubjects);

// Admin only routes
router.post("/", authMiddleware.adminMiddleware, createCategory);
router.put("/:id",authMiddleware.adminMiddleware,  updateCategory);
router.delete("/:id",authMiddleware.adminMiddleware,  deleteCategory);
router.patch("/bulk/status", authMiddleware.adminMiddleware,  bulkUpdateCategoryStatus);
router.put("/reorder", authMiddleware.adminMiddleware, reorderCategories);

module.exports = router;