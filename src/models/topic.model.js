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
      },
      // ADD THIS FOR RICH TEXT CONTENT
      content: {
        type: String,  // Will store HTML from rich text editor
        required: false,  // Set to true if content is mandatory
        default: ""
      },
      // OPTIONAL BUT RECOMMENDED FIELDS
      summary: {
        type: String,  // Short preview/description
        maxlength: 500,
        default: ""
      },
      importantNotes: {
        type: String,  // Could also be a separate rich text field for key points
        default: ""
      },
      resources: [{
        title: String,
        url: String,
        type: {
          type: String,
          enum: ['video', 'document', 'link', 'pdf'],
          default: 'link'
        }
      }],
      readTime: {
        type: Number,  // Estimated reading time in minutes
        default: null
      },
      order: {
        type: Number,  // To order topics within a subject
        default: 0
      }
    },
    { timestamps: true }
  );
  
  // Prevent duplicate topic inside same subject
  topicSchema.index({ name: 1, subject: 1 }, { unique: true });
  
  module.exports = mongoose.model("Topic", topicSchema);