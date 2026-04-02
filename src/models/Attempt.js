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

    expiresAt: Date, // 🔥 HARD TIMER LOCK (backend)

    submittedAt: Date
  },
  { timestamps: true }
);

// 🔥 Indexes (performance boost)
attemptSchema.index({ user: 1, test: 1 });
attemptSchema.index({ expiresAt: 1 });

module.exports = mongoose.model("Attempt", attemptSchema);