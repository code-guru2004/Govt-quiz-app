const express = require('express');
const router = express.Router();

const authMiddleware = require("../middleware/auth.middleware");
const subjectContoller = require("../controllers/subject.controller");
// create subject - only admin
router.post("/create",authMiddleware.adminMiddleware, subjectContoller.createSubject);
// update subject - admin + normal user
router.get("/search",authMiddleware.authMiddleware, subjectContoller.searchSubjects);
// get all subjects - for everyone
router.get("/all",authMiddleware.authMiddleware, subjectContoller.getAllSubjects);
// get all subjects with details (topics) - for everyone
router.get("/all/with-details",authMiddleware.authMiddleware, subjectContoller.getAllSubjectsWithDetails);
module.exports = router;