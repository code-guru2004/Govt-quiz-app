const mongoose = require("mongoose");

// 🔥 Reusable multilingual field
const multilingualString = {
  en: { type: String, required: true },
  hi: { type: String },
  bn: { type: String }
};

// 🔥 Option schema (with unique ID for shuffle safety)
const optionSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true // unique per question
    },
    en: { type: String, required: true },
    hi: { type: String },
    bn: { type: String }
  },
  { _id: false } // prevent extra _id for each option
);

const questionSchema = new mongoose.Schema(
  {
    // ✅ Multilingual Question
    questionText: multilingualString,

    questionImage: {
      type: String
    },

    // ✅ Options with ID (shuffle-safe)
    options: {
      type: [optionSchema],
      validate: [(arr) => arr.length >= 2, "At least 2 options required"]
    },

    // ✅ Store correct option ID
    correctAnswer: {
      type: String,
      required: true,
      select: false
    },

    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard"],
      default: "easy"
    },

    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true
    },

    topic: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Topic",
      required: true
    },

    marks: {
      type: Number,
      default: 1
    },

    negativeMarks: {
      type: Number,
      default: 0
    },

    // ✅ Multilingual explanation / fact
    fact: {
      en: { type: String, default: "" },
      hi: String,
      bn: String
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }
  },
  { timestamps: true }
);


// 🔥 Indexes
questionSchema.index({ "questionText.en": "text" }); // text search
questionSchema.index({ subject: 1, topic: 1 });

module.exports = mongoose.model("Question", questionSchema);