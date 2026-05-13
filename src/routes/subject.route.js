const express = require('express');
const router = express.Router();

const authMiddleware = require("../middleware/auth.middleware");
const subjectController = require("../controllers/subject.controller");

// ==================== ADMIN ONLY ROUTES ====================

// Create subject - only admin
router.post("/create", authMiddleware.adminMiddleware, subjectController.createSubject);

// Update subject - only admin
router.put("/update/:id", authMiddleware.adminMiddleware, subjectController.updateSubject);

// Delete subject - only admin (soft delete by default, hard delete with query param)
router.delete("/delete/:id", authMiddleware.adminMiddleware, subjectController.deleteSubject);

// Bulk update subjects status - only admin
router.patch("/bulk/status", authMiddleware.adminMiddleware, subjectController.bulkUpdateSubjectStatus);

// Reorder subjects - only admin
router.put("/reorder", authMiddleware.adminMiddleware, subjectController.reorderSubjects);

// Get all subjects with detailed stats - only admin
router.get("/admin/details", authMiddleware.adminMiddleware, subjectController.getAllSubjectsWithDetails);

// Get subject statistics - only admin
router.get("/statistics/:id", authMiddleware.adminMiddleware, subjectController.getSubjectStatistics);

// ==================== PROTECTED ROUTES (Auth Required) ====================

// Search subjects - authenticated users
router.get("/search", authMiddleware.authMiddleware, subjectController.searchSubjects);

// Get all subjects - authenticated users
router.get("/all", authMiddleware.authMiddleware, subjectController.getAllSubjects);

// Get subjects by category - authenticated users
router.get("/by-category/:categoryId", authMiddleware.authMiddleware, subjectController.getSubjectsByCategory);

// Get subject details by id - authenticated users
router.get("/:id", authMiddleware.authMiddleware, subjectController.getSubjectById);

// ==================== PUBLIC ROUTES (Optional - if you want no auth) ====================
// Uncomment these if you want public access to some endpoints
// router.get("/public/all", subjectController.getAllSubjects);
// router.get("/public/:id", subjectController.getSubjectById);
// router.get("/public/by-category/:categoryId", subjectController.getSubjectsByCategory);

module.exports = router;