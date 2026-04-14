// routes/attemptRoutes.js
const express = require("express");
const router = express.Router();
const { getAttemptResult } =require("../controllers/attempt.controller.js");
const authMiddleware = require("../middleware/auth.middleware.js");

// GET http://localhost:5000/api/attempts/result/69db976a6795efd35c2adf0b
router.get("/result/:attemptId", authMiddleware.authMiddleware, getAttemptResult);

module.exports = router;