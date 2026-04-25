const mongoose = require("mongoose");

const attemptSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    test: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Test",
      required: true,
      index: true
    },

    // 🔥 SNAPSHOT of questions at attempt time
    questions: [
      {
        questionId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Question",
          required: true
        },
        selectedOption: {
          type: String,
          default: null
        },
        isCorrect: {
          type: Boolean,
          default: false
        },
        isMarkedForReview: {
          type: Boolean,
          default: false
        },
        timeSpent: {
          type: Number,
          default: 0,
          min: 0
        },
        marksObtained: {
          type: Number,
          default: 0
        }
      }
    ],
    
    hasSections: {
      type: Boolean,
      default: false
    },
    
    sections: [
      {
        sectionIndex: {
          type: Number,
          required: true,
          min: 0
        },
        sectionTitle: {
          type: String,
          default: ""
        },
        sectionDuration: {
          type: Number, // minutes
          default: 0,
          min: 0
        },
        questions: [
          {
            questionId: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "Question",
              required: true
            },
            selectedOption: {
              type: String,
              default: null
            },
            isCorrect: {
              type: Boolean,
              default: false
            },
            isMarkedForReview: {
              type: Boolean,
              default: false
            },
            timeSpent: {
              type: Number,
              default: 0,
              min: 0
            },
            marksObtained: {
              type: Number,
              default: 0
            }
          }
        ],
        score: { //section score (can be calculated on the fly or stored)
          type: Number,
          default: 0
        },
        totalMarks: {
          type: Number,
          default: 0
        },
        completedAt: Date,
        sectionLocked: {
          type: Boolean,
          default: false
        }
      }
    ],

    // 🔥 Snapshot fields (important)
    totalQuestions: {
      type: Number,
      required: true,
      min: 1
    },
    totalMarks: {
      type: Number,
      required: true,
      min: 0
    },
    negativeMarks: {
      type: Number,
      default: 0,
      min: 0
    },
    duration: {
      type: Number, // minutes
      required: function() {
        return !this.hasSections; // Only required for flat tests
      },
      min: 1
    },

    score: { // total score obtained (can be calculated on the fly or stored)
      type: Number,
      default: 0,
      min: 0
    },
    correctAnswers : {
      type: Number,
      default: 0,
      min: 0
    },
    wrongAnswers :{
      type: Number,
      default: 0,
      min: 0
    },
    unattempted:{
      type: Number,
      default: 0,
      min: 0
    },
    status: {
      type: String,
      enum: ["pending", "in-progress", "paused", "completed", "expired"],
      default: "pending"
    },

    currentQuestionIndex: { // for flat tests, tracks which question user is on (can be used for resume)
      type: Number,
      default: 0,
      min: 0
    },
    
    currentSectionIndex: { // for section tests, tracks which section user is on (can be used for resume)
      type: Number,
      default: 0,
      min: 0
    },

    // ⏱️ Time handling (VERY IMPORTANT)
    startedAt: {
      type: Date,
      default: null
    },
    
    remainingTime: {
      type: Number, // seconds for flat test
      default: null,
      min: 0
    },
    
    sectionRemainingTime: [
      {
        sectionIndex: {
          type: Number,
          required: true
        },
        remainingTime: {
          type: Number, // seconds
          required: true,
          min: 0
        },
        lastUpdatedAt: {   // 🔥 ADD THIS
          type: Date,
          default: null
        }
      }
    ],
    
    lastResumedAt: {
      type: Date,
      default: null
    },

    submittedAt: Date,
    
    // for section tests
    sectionLocked: {
      type: Boolean,
      default: false
    },
    
    // Additional useful fields
    completedSections: {
      type: Number,
      default: 0
    },
    
    ipAddress: {
      type: String,
      default: null
    },
    
    userAgent: {
      type: String,
      default: null
    },
    
    deviceInfo: {
      type: String,
      default: null
    }
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// 🔥 PRE-SAVE HOOK - Fixed without 'next' parameter
attemptSchema.pre("save", function() {
  // Section-based attempt validation
  if (this.hasSections) {
    // Validate sections exist
    if (!this.sections || this.sections.length === 0) {
      throw new Error("Sections required for section-based attempt");
    }

    // Validate each section structure
    for (let i = 0; i < this.sections.length; i++) {
      const sec = this.sections[i];
      
      if (typeof sec.sectionIndex !== "number" || sec.sectionIndex < 0) {
        throw new Error(`Invalid sectionIndex at position ${i}`);
      }
      
      if (!Array.isArray(sec.questions) || sec.questions.length === 0) {
        throw new Error(`Questions required for section ${sec.sectionIndex}`);
      }
      
      // Validate each question in section
      for (let j = 0; j < sec.questions.length; j++) {
        if (!sec.questions[j].questionId) {
          throw new Error(`Missing questionId in section ${sec.sectionIndex}, question ${j}`);
        }
      }
    }

    // Remove flat questions for section tests
    this.questions = [];
  } 
  // Flat test validation
  else {
    if (!Array.isArray(this.questions) || this.questions.length === 0) {
      throw new Error("Questions required for flat attempt");
    }
    
    // Validate each question in flat attempt
    for (let i = 0; i < this.questions.length; i++) {
      if (!this.questions[i].questionId) {
        throw new Error(`Missing questionId at position ${i}`);
      }
    }

    // Remove sections for flat tests
    this.sections = [];
  }

  // Auto-calculate totalQuestions if not provided
  if (!this.totalQuestions) {
    this.totalQuestions = this.hasSections 
      ? this.sections.reduce((sum, sec) => sum + sec.questions.length, 0)
      : this.questions.length;
  }

  // Set startedAt if status is changing to in-progress
  if (this.status === "in-progress" && !this.startedAt) {
    this.startedAt = new Date();
    this.lastResumedAt = new Date();
  }

  // Set submittedAt when status becomes completed
  if (this.status === "completed" && !this.submittedAt) {
    this.submittedAt = new Date();
  }

  // Ensure remainingTime is set for flat tests
  if (!this.hasSections && this.status === "in-progress" && this.remainingTime === null && this.duration) {
    this.remainingTime = this.duration * 60; // Convert to seconds
  }
});

// 🔥 METHOD: Calculate score (can be called when needed)
attemptSchema.methods.calculateScore = async function() {
  let totalScore = 0;
  
  if (this.hasSections) {
    for (const section of this.sections) {
      let sectionScore = 0;
      for (const q of section.questions) {
        if (q.isCorrect) {
          // Add logic for marks per question if needed
          sectionScore += 1; // Adjust based on your marking scheme
        } else if (q.selectedOption && this.negativeMarks > 0) {
          sectionScore -= this.negativeMarks;
        }
        q.marksObtained = q.isCorrect ? 1 : (q.selectedOption ? -this.negativeMarks : 0);
      }
      section.score = Math.max(0, sectionScore);
      totalScore += section.score;
    }
  } else {
    for (const q of this.questions) {
      if (q.isCorrect) {
        totalScore += 1; // Adjust based on your marking scheme
      } else if (q.selectedOption && this.negativeMarks > 0) {
        totalScore -= this.negativeMarks;
      }
      q.marksObtained = q.isCorrect ? 1 : (q.selectedOption ? -this.negativeMarks : 0);
    }
  }
  
  this.score = Math.max(0, totalScore);
  return this.score;
};

// 🔥 VIRTUAL: Percentage score
attemptSchema.virtual('percentage').get(function() {
  if (this.totalMarks === 0) return 0;
  return ((this.score / this.totalMarks) * 100).toFixed(2);
});

// 🔥 VIRTUAL: Time taken in minutes
attemptSchema.virtual('timeTakenMinutes').get(function() {
  if (!this.startedAt) return 0;
  const endTime = this.submittedAt || new Date();
  return Math.floor((endTime - this.startedAt) / 60000);
});

// 🔥 VIRTUAL: Is attempt expired
attemptSchema.virtual('isExpired').get(function() {
  if (!this.startedAt || this.status === 'completed') return false;
  const elapsedMinutes = (Date.now() - this.startedAt) / 60000;
  return elapsedMinutes > this.duration;
});

// 🔥 INDEXES - Optimized for production
// 1. For finding user's attempts (most common query)
attemptSchema.index({ user: 1, createdAt: -1 });

// 2. For finding attempts by test (analytics)
attemptSchema.index({ test: 1, status: 1, createdAt: -1 });

// 3. For leaderboard queries
attemptSchema.index({ status: 1, score: -1 });

// 4. Unique constraint: One active attempt per user per test
attemptSchema.index(
  { user: 1, test: 1, status: 1 },
  { 
    unique: true, 
    partialFilterExpression: { status: { $in: ["in-progress", "paused"] } }
  }
);

// 5. For finding completed attempts (different from active)
attemptSchema.index(
  { user: 1, test: 1, status: "completed" }
);

// 6. For time-based cleanup of abandoned attempts
attemptSchema.index(
  { createdAt: 1, status: 1 },
  { 
    expireAfterSeconds: 604800, // 7 days
    partialFilterExpression: { status: { $in: ["in-progress", "paused", "pending"] } }
  }
);

// 7. For test analytics
attemptSchema.index({ test: 1, status: 1, score: -1 });

// 8. For finding attempts by date range
attemptSchema.index({ startedAt: 1, status: 1 });

// 9. Compound index for section-based queries
attemptSchema.index({ hasSections: 1, test: 1, status: 1 });

module.exports = mongoose.model("Attempt", attemptSchema);