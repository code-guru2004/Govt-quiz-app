const express = require('express');
const router = express.Router();

const authMiddleware = require("../middleware/auth.middleware");
const subjectContoller = require("../controllers/subject.controller");

router.post("/create",authMiddleware.adminMiddleware, subjectContoller.createSubject);
router.get("/search",authMiddleware.authMiddleware, subjectContoller.searchSubjects);

module.exports = router;