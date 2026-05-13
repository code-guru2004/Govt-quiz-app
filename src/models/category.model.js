const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema(
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
    },
    order: {
      type: Number,
      default: 0
    },
    icon: {
      type: String,
      default: ""
    },
    colorCode: {
      type: String,
      default: "#3B82F6"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Category", categorySchema);