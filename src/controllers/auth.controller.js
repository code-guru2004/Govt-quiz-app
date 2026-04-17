const userModel = require("../models/User");
const tokenBlackListModel = require("../models/blackList.model");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { generateOtp } = require("../utils/generateOtp");
const { otpTemplate } = require("../utils/otpTemplate");
const { sendEmail } = require("../services/sendEmail");


async function registerUser(req, res) {
  const { email, name, password, mobile } = req.body;

  const isExists = await userModel.findOne({ email });

  if (isExists) {
    return res.status(422).json({
      success: false,
      message: "User alreasy exists"
    });
  }

  const newUser = await userModel.create({
    email,
    name,
    password,
    mobile
  });

  const token = jwt.sign({
    userId: newUser._id,
    role: newUser.role
  }, process.env.JWT_SECRET, { expiresIn: "3d" });

  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "none",
    path: "/", // ✅ VERY IMPORTANT
    maxAge: 3 * 24 * 60 * 60 * 1000,
  });

  res.status(201).json({
    success: true,
    message: "User register successfully",
    user: {
      _id: newUser._id,
      email: newUser.email,
      name: newUser.name,
      mobile: newUser.mobile
    },
    token
  });

  //  await emailService.sendRegistrationemail(newUser.email,newUser.name)

}


async function loginUser(req, res) {
  const { email, password } = req.body;

  const user = await userModel.findOne({ email }).select("+password");

  if (!user) {
    return res.status(401).json({
      success: false,
      message: "User not found"
    })
  }

  const isCorrectPassword = await user.comparePassword(password);

  if (!isCorrectPassword) {
    return res.status(401).json({
      success: false,
      message: "Password is invalid"
    })
  }

  const token = jwt.sign({
    userId: user._id,
    role: user.role
  }, process.env.JWT_SECRET, { expiresIn: "3d" });

  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "none",
    path: "/", // ✅ VERY IMPORTANT
    maxAge: 3 * 24 * 60 * 60 * 1000,
  });

  res.status(200).json({
    success: true,
    message: "User login successfully",
    user: {
      _id: user._id,
      email: user.email,
      name: user.name
    },
    token
  })
}

// GET current user
async function getMe(req, res) {
  try {
    const token = req.cookies.token || req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ success: false });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await userModel.findById(decoded.userId).select("-password");

    res.json({
      success: true,
      user,
    });
  } catch (err) {
    res.status(401).json({ success: false });
  }
}


// logout controller backend
async function logoutUser(req, res) {
  try {
    //console.log("Logout hit");

    const token =
      req.cookies.token || req.headers.authorization?.split(" ")[1];

    //console.log("token logout:", token);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "No token provided",
      });
    }

    res.clearCookie("token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "none",
    });


    await tokenBlackListModel.create({ token });

    return res.status(200).json({
      success: true,
      message: "logout successful",
    });
  } catch (error) {
    console.error("Logout error:", error);
    return res.status(500).json({
      success: false,
      message: "Logout failed",
    });
  }
}


// resebd otp controller
// controllers/authController.js

const resendOtp = async (req, res) => {
  try {
    const userId = req.user.id; // from auth middleware
    console.log("Resend OTP hit for userId:", userId);
    const user = await userModel.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.isVerified) {
      return res.status(400).json({ message: "User already verified" });
    }

    // ⏱️ Cooldown check (30 sec)
    if (
      user.otpLastSentAt &&
      Date.now() - user.otpLastSentAt.getTime() < 30 * 1000
    ) {
      return res.status(429).json({
        message: "Please wait before requesting another OTP",
      });
    }

    // 🔢 Generate OTP
    const otp = generateOtp();

    // 🔐 Hash OTP
    const hashedOtp = await bcrypt.hash(otp, 10);

    // 💾 Save
    user.otp = {
      code: hashedOtp,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 min
    };
    user.otpAttempts = 0;
    user.otpLastSentAt = new Date();

    await user.save();

    await sendEmail({
      to: user.email,
      subject: "Verify your account - OTP",
      html: otpTemplate(otp, user.name),
    });
    return res.status(200).json({
      message: "OTP sent successfully",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to send OTP",
      error: error.message,
    });
  }
};

// verify otp controller
const verifyOtp = async (req, res) => {
  try {
    const userId = req.user.id;
    const { otp } = req.body;
    if (!otp) {
      return res.status(400).json({ message: "OTP is required" });
    }

    const user = await userModel.findById(userId).select("+otp.code");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.isVerified) {
      return res.status(400).json({ message: "User already verified" });
    }

    // 🚫 Attempt limit
    if (user.otpAttempts >= 5) {
      return res.status(429).json({
        message: "Too many attempts. Try again later.",
      });
    }

    // ⏳ Expiry check
    if (!user.otp || user.otp.expiresAt < Date.now()) {
      return res.status(400).json({
        message: "OTP expired. Please request a new one.",
      });
    }

    // 🔐 Compare OTP
    const isMatch = await bcrypt.compare(otp, user.otp.code);

    if (!isMatch) {
      user.otpAttempts += 1;
      await user.save();

      return res.status(400).json({
        message: "Invalid OTP",
      });
    }

    // ✅ Success
    user.isVerified = true;
    user.otp = undefined;
    user.otpAttempts = 0;

    await user.save();

    return res.status(200).json({
      message: "User verified successfully",
    });
  } catch (error) {
    return res.status(500).json({
      message: "OTP verification failed",
      error: error.message,
    });
  }
};
module.exports = {
  registerUser,
  loginUser,
  logoutUser,
  getMe,
  resendOtp,
  verifyOtp
}