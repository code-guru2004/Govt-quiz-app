const mongoose = require("mongoose");

const subjectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
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
    
    // Reference to Category (NEW)
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true
    },
    
    order: {
      type: Number,
      default: 0
    },
    
    difficultyLevel: {
      type: String,
      enum: ['Beginner', 'Intermediate', 'Advanced'],
      default: 'Beginner'
    },
    
    // For exam-specific variations
    examMapping: [{
      exam: {
        type: String,
        enum: ['SSC', 'RRB_NTPC', 'UPSC', 'STATE_PSC', 'BANKING', 'OTHER']
      },
      weightage: Number, // Percentage weightage in exam
      important: { type: Boolean, default: false }
    }]
  },
  { timestamps: true }
);

// Ensure unique subject name within a category
subjectSchema.index({ name: 1, category: 1 }, { unique: true });

module.exports = mongoose.model("Subject", subjectSchema);