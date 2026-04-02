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

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Test", testSchema);