const mongoose = require("mongoose");

const attemptSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    test: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Test",
      required: true,
      index: true
    },

    // 🔥 SNAPSHOT of questions at attempt time
    questions: [
      {
        questionId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Question"
        },
        selectedOption: String,
        isCorrect: Boolean,
        isMarkedForReview: {
          type: Boolean,
          default: false
        },
        timeSpent: {
          type: Number,
          default: 0
        }
      }
    ],

    // 🔥 Snapshot fields (important)
    totalQuestions: Number,
    totalMarks: Number,
    negativeMarks: Number,
    duration: Number, // minutes

    score: {
      type: Number,
      default: 0
    },

    status: {
      type: String,
      enum: ["in-progress", "paused", "completed"],
      default: "in-progress"
    },

    currentQuestionIndex: {
      type: Number,
      default: 0
    },

    // ⏱️ Time handling (VERY IMPORTANT)
    startedAt: {
      type: Date,
      default: Date.now
    },
    remainingTime: Number, // seconds
    lastResumedAt: Date,

    submittedAt: Date
  },
  { timestamps: true }
);

// 🔥 Indexes (performance boost)
// ========== OPTIMIZED INDEXES ==========

// 1. For finding user's attempts (most common query)
attemptSchema.index({ user: 1, createdAt: -1 });

// 2. For finding attempts by test (analytics)
attemptSchema.index({ test: 1, status: 1, createdAt: -1 });

// 3. For leaderboard queries (your ranking logic)
attemptSchema.index({ status: 1, score: -1, user: 1 });

// 4. Unique constraint: One active attempt per user per test
attemptSchema.index(
  { user: 1, test: 1, status: 1 },
  { 
    unique: true, 
    partialFilterExpression: { status: { $in: ["in-progress", "paused"] } }
  }
);
attemptSchema.index(
  { user: 1, test: 1, status: "completed" },
  { 
    unique: true,
    partialFilterExpression: { status: "completed" }
  }
);

// 7. For time-based queries
attemptSchema.index({ startedAt: 1, status: 1 });

// 8. For pagination in leaderboard
attemptSchema.index({ status: 1, "user": 1 });

// Add this instead of expiresAt index
attemptSchema.index(
  { createdAt: 1 },
  { 
    expireAfterSeconds: 604800, // 7 days in seconds
    partialFilterExpression: { status: { $in: ["in-progress", "paused"] } }
  }
);

module.exports = mongoose.model("Attempt", attemptSchema);