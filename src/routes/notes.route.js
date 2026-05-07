const express = require("express");
const router = express.Router();
const {
    createNote,
    getNotes,
    getNoteById,
    updateNote,
    patchNote,
    deleteNote,
    getNotesByTopic,
    togglePublishStatus,
    bulkCreateNotes,
    getNoteVersions,
    searchNotesInTopic,
    addResourceToNote,
    removeResourceFromNote
} = require("../controllers/notes.controller");

// Middleware for authentication (if you have it)
const authMiddleware = require("../middleware/auth.middleware");

// Note routes
router.post("/", authMiddleware.adminMiddleware,createNote);                           // Create a new note
router.get("/",authMiddleware.authMiddleware, getNotes);                              // Get all notes with filtering
router.get("/topic/:topicId",authMiddleware.authMiddleware, getNotesByTopic);         // Get all notes for a specific topic
router.get("/search/topic/:topicId",authMiddleware.authMiddleware, searchNotesInTopic); // Search notes within a topic
router.post("/bulk",authMiddleware.authMiddleware, bulkCreateNotes);                  // Bulk create notes
router.get("/:noteId",authMiddleware.authMiddleware, getNoteById);                    // Get single note by ID
router.put("/:noteId",authMiddleware.adminMiddleware,authMiddleware.adminMiddleware, updateNote);                     // Full update of a note
router.patch("/:noteId",authMiddleware.adminMiddleware,authMiddleware.adminMiddleware, patchNote);                    // Partial update of a note
router.delete("/:noteId",authMiddleware.adminMiddleware, deleteNote);                  // Delete a note
router.patch("/:noteId/toggle-publish",authMiddleware.adminMiddleware, togglePublishStatus); // Toggle publish status
router.get("/:noteId/versions",authMiddleware.authMiddleware, getNoteVersions);       // Get note version history
router.post("/:noteId/resources",authMiddleware.adminMiddleware, addResourceToNote);   // Add resource to note
router.delete("/:noteId/resources/:resourceIndex",authMiddleware.adminMiddleware, removeResourceFromNote); // Remove resource from note

module.exports = router;