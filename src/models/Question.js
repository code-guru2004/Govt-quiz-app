const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema(
  {
    questionText: {
      type: String,
      required: true
    },
    questionImage:{
        type: String,
        required: false
    },
    options: {
        type: [{
        type: String,
        required: true
      }],
      validate: [(arr) => arr.length >= 2, "At least 2 options required"]
    },

    correctAnswer: {
      type: String,
      required: true,
      select: false // 🔥 hide from frontend
    },

    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard"],
      default: "easy"
    },

    subject: {
        type: String,
        required: true,
        index: true,
        lowercase: true,
        trim: true
      },
  
    topic: {
        type: String,
        required: true,
        index: true,
        lowercase: true,
        trim: true,
      },

    marks: {
      type: Number,
      default: 1
    },

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
questionSchema.index({ questionText: "text" });
questionSchema.index({ subject: 1, topic: 1 });

module.exports = mongoose.model("Question", questionSchema);