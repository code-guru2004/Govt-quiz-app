const mongoose = require("mongoose");

const testSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },

    description: String,

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

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Test", testSchema);