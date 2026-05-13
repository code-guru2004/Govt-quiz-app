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
    
    // Optional: Direct category reference for faster queries
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category"
    },
    
    isActive: {
      type: Boolean,
      default: true
    },
    
    imageUrl: {
      type: String,
      default: null
    },
    
    summary: {
      type: String,
      maxlength: 500,
      default: ""
    },
    
    order: {
      type: Number,
      default: 0
    },
    
    readTime: {
      type: Number,
      default: null
    },
    
    // Importance level specific to topic
    importanceLevel: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Very High'],
      default: 'High'
    },
    
    // Prerequisite topics
    prerequisites: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Topic"
    }],
    
    // Exam-specific configuration
    examSpecific: [{
      exam: {
        type: String,
        enum: ['SSC', 'RRB_NTPC', 'UPSC', 'STATE_PSC', 'BANKING', 'OTHER']
      },
      importance: {
        type: String,
        enum: ['Low', 'Medium', 'High', 'Critical'],
        default: 'Medium'
      },
      weightage: Number,
      previousYearCount: Number // Number of times appeared in past exams
    }],
    
    // Tags for better search/filtering
    tags: [{
      type: String,
      trim: true
    }],
    
    // Metadata
    metadata: {
      totalQuestions: { type: Number, default: 0 },
      averageTimePerQuestion: { type: Number }, // in seconds
      successRate: { type: Number, min: 0, max: 100 }
    }
  },
  { timestamps: true }
);

topicSchema.index({ name: 1, subject: 1 }, { unique: true });
topicSchema.index({ tags: 1 });
topicSchema.index({ 'examSpecific.exam': 1, 'examSpecific.importance': 1 });

// Pre-save middleware to auto-populate category
topicSchema.pre('save', async function () {
  if (this.subject && !this.category) {
    const Subject = mongoose.model('Subject');

    const subject = await Subject.findById(this.subject);

    if (subject && subject.category) {
      this.category = subject.category;
    }
  }
});

module.exports = mongoose.model("Topic", topicSchema);