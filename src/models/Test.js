const mongoose = require("mongoose");

const testSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },

    description: {
      type: String,
      trim: true,
      default: "",
      minlength: 5,
      maxlength: 500
    },

    duration: {
      type: Number, // in minutes
      required: true
    },

    totalMarks: {
      type: Number,
      default: 0
    },

    isPublished: {
      type: Boolean,
      default: false
    },
    maxAttempts: {
      type: Number,
      default: 1
    },
    allowResume: {
      type: Boolean,
      default: false
    },
    shuffleQuestions: {
      type: Boolean,
      default: false
    },
    showResultImmediately: {
      type: Boolean,
      default: false
    },
    questions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Question"
      }
    ],
    // Add to your Test schema
    isFeatured: {
      type: Boolean,
      default: false
    },
    startTime: {
      type: Date,
      required: true
    },

    endTime: {
      type: Date,
      required: true
    },
    // 🔥 NEW FIELD
    testType: {
      type: String,
      enum: ["topic", "subject", "full"],
      required: true
    },
    // 🔥 OPTIONAL REFERENCES
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      default: null
    },

    topic: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Topic",
      default: null
    },
    // 🔥 For FULL TEST (multi subjects)
    subjects: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Subject"
      }
    ],
    negativeMarks: {
      type: Number,
      default: 0
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }
  },
  { timestamps: true }
);
// In your Test schema
testSchema.index({ testType: 1, isActive: 1, createdAt: -1 });
testSchema.index({ testType: 1, subject: 1 });
testSchema.index({ testType: 1, topic: 1 });
testSchema.index({ testType: 1, difficulty: 1 });
testSchema.index({ title: "text", description: "text" }); // For search


module.exports = mongoose.model("Test", testSchema);