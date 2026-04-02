const express = require('express');
const router = express.Router();

const authController = require("../controllers/auth.controller")
// Register
// api route: POST /api/auth/register

router.post('/register', authController.registerUser);


// Login
router.post('/login',authController.loginUser);

// logout
router.post("/logout",authController.logoutUser)

module.exports = router;