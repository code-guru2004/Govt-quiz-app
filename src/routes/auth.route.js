const express = require('express');
const router = express.Router();

const authController = require("../controllers/auth.controller");
const authMiddleware = require("../middleware/auth.middleware");
// Register
// api route: POST /api/auth/register

router.post('/register', authController.registerUser);



// Login
router.post('/login',authController.loginUser);

// get me
router.get("/me",authMiddleware.authMiddleware,authController.getMe)
// logout
router.post("/logout",authController.logoutUser)

module.exports = router;