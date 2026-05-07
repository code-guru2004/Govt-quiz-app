const mongoose = require("mongoose");

const noteSchema = new mongoose.Schema(
  {
    topic: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Topic",
      required: true
    },

    title: {
      type: String,
      required: true,
      trim: true
    },

    content: {
      type: String,
      default: ""
    },

    importantNotes: {
      type: String,
      default: ""
    },

    resources: [
      {
        title: String,

        url: String,

        type: {
          type: String,
          enum: ["video", "document", "link", "pdf"],
          default: "link"
        }
      }
    ],

    version: {
      type: Number,
      default: 1
    },

    isPublished: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Note", noteSchema);