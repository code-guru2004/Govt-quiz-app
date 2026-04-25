const mongoose = require("mongoose");

const testSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },

    description: {
      type: String,
      trim: true,
      default: "",
      minlength: 5,
      maxlength: 500
    },

    duration: {
      type: Number, // in minutes
      required: function () {
        return !this.hasSections;
      }
    },
    scheduleType: {
      type: String,
      enum: ["one-time", "daily", "weekly", "monthly"],
      default: "one-time"
    },
    recurrence: {
      type: {
        daysOfWeek: {
          type: [Number], // 0 = Sunday, 6 = Saturday
          default: []
        },
        dayOfMonth: {
          type: Number, // 1–31 (for monthly)
          default: null
        },
        timeOfDay: {
          type: String, // "14:00"
          default: null
        }
      },
      default: null
    },
    totalMarks: {
      type: Number,
      default: 0
    },

    isPublished: {
      type: Boolean,
      default: false
    },
    maxAttempts: {
      type: Number,
      default: 1
    },
    allowResume: {
      type: Boolean,
      default: false
    },
    shuffleQuestions: {
      type: Boolean,
      default: false
    },
    showResultImmediately: {
      type: Boolean,
      default: false
    },
    questions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Question"
      }
    ],
    // for section tests (future)
    hasSections: {
      type: Boolean,
      default: false
    },
    sections: [
      {
        title: String,
        duration: Number, // in minutes (section timer)
        questions: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Question"
          }
        ]
      }
    ],
    // Add to your Test schema
    isFeatured: {
      type: Boolean,
      default: false
    },
    startTime: {
      type: Date,

    },

    endTime: {
      type: Date,

    },
    // 🔥 NEW FIELD
    testType: {
      type: String,
      enum: ["topic", "subject", "full"],
      required: true
    },
    // 🔥 OPTIONAL REFERENCES
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      default: null
    },

    topic: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Topic",
      default: null
    },
    // 🔥 For FULL TEST (multi subjects)
    subjects: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Subject"
      }
    ],
    negativeMarks: {
      type: Number,
      default: 0
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    // daily test optimization fields
    validForDate: {
      type: Date
    },
    isTemplate: {
      type: Boolean,
      default: false
    },
    parentTest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Test",
      default: null
    }
  },
  { timestamps: true }
);

// pre
// Pre-save hook - Using async/await pattern (no next parameter)
testSchema.pre("save", async function () {
  // ================================
  // 1. PUBLISH VALIDATION
  // ================================
  if (this.isPublished) {
    if (this.hasSections) {
      const hasEmptySection = this.sections.some(s => !s.questions?.length);
      if (hasEmptySection) {
        throw new Error("Cannot publish: sections missing questions");
      }
    } else {
      if (!this.questions.length) {
        throw new Error("Cannot publish: no questions added");
      }
    }
  }

  // ================================
  // 2. STRUCTURE VALIDATION
  // ================================
  if (this.hasSections) {
    if (!this.sections?.length) {
      throw new Error("Sections required when hasSections is true");
    }

    for (const section of this.sections) {
      if (
        !section.title ||
        typeof section.duration !== "number" ||
        section.duration <= 0
      ) {
        throw new Error("Each section must have valid title and duration > 0");
      }

      // if (!this.isNew && (!section.questions || section.questions.length === 0)) {
      //   throw new Error("Each section must have questions when updating");
      // }
    }

    // Remove flat questions
    this.questions = [];
  } else {
    if (!this.hasSections) {
      // Only validate if test is being published
      if (this.isPublished && (!this.questions || this.questions.length === 0)) {
        throw new Error("Published test must have at least one question");
      }
    }

    // Remove sections
    this.sections = [];
  }

  // ================================
  // 3. BASIC RULES
  // ================================

  // ❌ One-time cannot be template
  if (this.isTemplate && this.scheduleType === "one-time") {
    throw new Error("One-time tests cannot be templates");
  }

  // ❌ Recurring test must come from template
  if (!this.isTemplate && this.scheduleType !== "one-time" && !this.parentTest) {
    throw new Error("Recurring tests must be generated from a template");
  }

  // ⏱ Duration required for non-section real tests
  if (!this.hasSections && !this.duration && !this.isTemplate) {
    throw new Error("Duration required for non-section test");
  }

  // ================================
  // 4. GENERATED TEST CLEANUP
  // ================================
  if (!this.isTemplate && this.parentTest) {
    this.recurrence = null; // generated tests should not have recurrence
  }

  // ================================
  // 5. ONE-TIME TEST VALIDATION
  // ================================
  if (!this.isTemplate && this.scheduleType === "one-time") {
    this.recurrence = null;

    if (!this.startTime || !this.endTime) {
      throw new Error("startTime and endTime required for one-time test");
    }

    if (this.isNew) {
      const now = new Date();
      if (new Date(this.startTime) <= now) {
        throw new Error("Start time must be in the future");
      }
    }

    if (new Date(this.endTime) <= new Date(this.startTime)) {
      throw new Error("End time must be greater than start time");
    }
  }

  // ================================
  // 6. RECURRENCE VALIDATION (TEMPLATE ONLY)
  // ================================
  if (this.isTemplate) {
    if (this.scheduleType === "one-time") {
      throw new Error("One-time tests cannot be templates");
    }
  
    if (!this.recurrence || !this.recurrence.timeOfDay) {
      console.log("DEBUG TEMPLATE:", {
        isTemplate: this.isTemplate,
        scheduleType: this.scheduleType,
        recurrence: this.recurrence
      });
      throw new Error("Template must define recurrence with timeOfDay");
    }
  
    // Normalize recurrence (VERY IMPORTANT)
    this.recurrence = {
      timeOfDay: this.recurrence.timeOfDay,
      daysOfWeek: this.recurrence.daysOfWeek || [],
      dayOfMonth: this.recurrence.dayOfMonth || null
    };
  
    this.startTime = null;
    this.endTime = null;
    this.validForDate = null;
  }

  // ================================
  // 7. OPTIONAL AUTO MARKS
  // ================================
  if (this.totalMarks === 0 && !this.isNew) {
    // calculate later
  }
});

// Pre-validate hook - Using async/await pattern (no next parameter)
testSchema.pre("validate", async function() {
  // Ensure testType matches the references
  if (this.testType === "topic" && !this.topic) {
    throw new Error("Topic reference is required for topic test");
  }
  
  if (this.testType === "subject" && !this.subject) {
    throw new Error("Subject reference is required for subject test");
  }
  
  if (this.testType === "full" && (!this.subjects || this.subjects.length === 0)) {
    throw new Error("At least one subject reference is required for full test");
  }
  
  // Additional validation: For topic tests, ensure either topic or subject is provided
  if (this.testType === "topic" && !this.topic && !this.subject) {
    throw new Error("Either topic or subject must be provided for topic test");
  }
  
  // No need to call next()
});


testSchema.index({ testType: 1, isPublished: 1, createdAt: -1 });
testSchema.index({ testType: 1, subject: 1 });
testSchema.index({ testType: 1, topic: 1 });
testSchema.index({ title: "text", description: "text" }); // For search
testSchema.index({ validForDate: 1, isPublished: 1 });
testSchema.index({ parentTest: 1 });
testSchema.index(
  { parentTest: 1, validForDate: 1 },
  {
    unique: true,
    partialFilterExpression: {
      parentTest: { $ne: null },
      validForDate: { $ne: null }
    }
  }
);
testSchema.index({
  scheduleType: 1,
  startTime: 1,
  endTime: 1,
  validForDate: 1,
  testType: 1
});
testSchema.index({ isPublished: 1, startTime: 1, endTime: 1 });
testSchema.index({ isTemplate: 1 });

module.exports = mongoose.model("Test", testSchema);