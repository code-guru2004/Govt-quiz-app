const mongoose = require("mongoose");

const topicSchema = new mongoose.Schema(
    {
      name: {
        type: String,
        required: true,
        trim: true
      },
      subject: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Subject",
        required: true
      },
      isActive: {
        type: Boolean,
        default: true
      },
      imageUrl: {
        type: String,
        default: null
      }
    },
    { timestamps: true }
  );
  
  // Prevent duplicate topic inside same subject
  topicSchema.index({ name: 1, subject: 1 }, { unique: true });
  
  module.exports = mongoose.model("Topic", topicSchema);