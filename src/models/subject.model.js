const mongoose = require("mongoose");

const subjectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    description: String,
    isActive: {
      type: Boolean,
      default: true
    },
    imageUrl: {
      type: String,
      default: "",
      trim: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Subject", subjectSchema);