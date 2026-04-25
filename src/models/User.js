const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const userSchema = new mongoose.Schema(
  {
    // ... (your existing fields)
    name: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: [true, "This email is already registered"],
      trim: true,
      lowercase: true,
      match: [emailRegex, "please enter a valid email address"]
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false
    },
    mobile: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: [/^\d{10}$/, "Please enter a valid 10-digit mobile number"]
    },
    role: {
      type: String,
      enum: ["admin", "user"],
      default: "user",
    },
    otp: {
      code: {
        type: String,
        select: false
      },
      expiresAt: {
        type: Date
      }
    },
    otpAttempts: {
      type: Number,
      default: 0
    },
    otpLastSentAt: {
      type: Date
    },
    isVerified: {
      type: Boolean,
      default: false
    },
    bookmarks: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Test"
      }
    ],
  },
  { timestamps: true }
);

// Hash password before saving
userSchema.pre("save", async function() {
  if (!this.isModified("password")) {
    return;
  }
  const hash = await bcrypt.hash(this.password, 10);
  this.password = hash;
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};



module.exports = mongoose.model("User", userSchema);