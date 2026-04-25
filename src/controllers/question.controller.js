const { default: mongoose } = require("mongoose");
const Question = require("../models/Question");
const subjectModel = require("../models/subject.model");
const topicModel = require("../models/topic.model");
const { randomUUID } = require("crypto");

// Helper function to normalize text for duplicate comparison
const normalizeText = (text) => {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')  // Replace multiple spaces with single space
    .replace(/[^\w\s]/g, ''); // Remove punctuation for better matching
};

// Helper function to check if two questions are duplicates
const isDuplicateQuestion = (existingQuestion, newQuestionData) => {
  // Compare English question text (case-insensitive, trimmed)
  const existingText = normalizeText(existingQuestion.questionText.en);
  const newText = normalizeText(newQuestionData.questionText.en);
  
  if (existingText !== newText) return false;
  
  // Compare number of options
  if (existingQuestion.options.length !== newQuestionData.options.length) return false;
  
  // Compare options (order doesn't matter for duplicate detection)
  const existingOptions = existingQuestion.options.map(opt => normalizeText(opt.en)).sort();
  const newOptions = newQuestionData.options.map(opt => normalizeText(opt.en)).sort();
  
  for (let i = 0; i < existingOptions.length; i++) {
    if (existingOptions[i] !== newOptions[i]) return false;
  }
  
  return true;
};

// Bulk create questions from JSON - with duplicate detection
const bulkCreateQuestions = async (req, res) => {
  try {
    const {
      questions,        // Array of question objects
      subject,          // Common subject for all questions
      topic,            // Common topic for all questions
      defaultDifficulty, // Optional: override individual difficulties
      defaultMarks,     // Optional: override individual marks
      defaultNegativeMarks, // Optional: override individual negative marks
      skipDuplicates = true, // Optional: if true, skip duplicates; if false, throw error
      checkAgainstDatabase = true // Optional: check against existing questions in DB
    } = req.body;

    // 🔥 Basic validation
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({
        msg: "Questions array is required and must not be empty"
      });
    }

    if (questions.length > 500) {
      return res.status(400).json({
        msg: "Maximum 500 questions allowed per bulk upload"
      });
    }

    if (!subject || !topic) {
      return res.status(400).json({
        msg: "Subject and topic are required for bulk upload"
      });
    }

    // 🔥 Validate subject & topic IDs
    if (
      !mongoose.Types.ObjectId.isValid(subject) ||
      !mongoose.Types.ObjectId.isValid(topic)
    ) {
      return res.status(400).json({
        msg: "Invalid subject or topic ID format"
      });
    }

    const subjectExists = await subjectModel.findById(subject);
    const topicExists = await topicModel.findById(topic);

    if (!subjectExists || !topicExists) {
      return res.status(400).json({
        msg: "Invalid subject or topic"
      });
    }

    if (topicExists.subject.toString() !== subject) {
      return res.status(400).json({
        msg: "Topic does not belong to selected subject"
      });
    }

    // 🔥 Fetch existing questions from database for this subject and topic (if checkAgainstDatabase is true)
    let existingQuestions = [];
    if (checkAgainstDatabase) {
      existingQuestions = await Question.find({ 
        subject: subject, 
        topic: topic 
      }).select('questionText options');
    }

    const results = {
      successful: [],
      failed: [],
      skipped: [], // Track skipped duplicates
      total: questions.length
    };

    // Track duplicates within the current batch
    const batchDuplicateTracker = new Map(); // Key: normalized text, Value: first occurrence index

    // Process each question
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const questionIndex = i + 1;
      let isDuplicate = false;
      let duplicateReason = null;

      try {
        // 🔥 Validate required fields for each question
        if (!q.questionText?.en) {
          throw new Error(`Question ${questionIndex}: English question text is required`);
        }

        if (!q.options || !Array.isArray(q.options) || q.options.length < 2) {
          throw new Error(`Question ${questionIndex}: At least 2 options required`);
        }

        // Validate each option has English text
        for (let optIdx = 0; optIdx < q.options.length; optIdx++) {
          if (!q.options[optIdx].en) {
            throw new Error(`Question ${questionIndex}, Option ${optIdx + 1}: English text is required`);
          }
        }

        // 🔥 Check for duplicates within the current batch
        const normalizedQuestionText = normalizeText(q.questionText.en);
        const normalizedOptions = q.options.map(opt => normalizeText(opt.en)).sort();
        const batchKey = `${normalizedQuestionText}|${normalizedOptions.join('|')}`;
        
        if (batchDuplicateTracker.has(batchKey)) {
          isDuplicate = true;
          duplicateReason = `Duplicate within same batch (first occurrence at question ${batchDuplicateTracker.get(batchKey)})`;
        } else {
          batchDuplicateTracker.set(batchKey, questionIndex);
        }

        // 🔥 Check against existing database questions
        if (!isDuplicate && checkAgainstDatabase) {
          const questionDataForCheck = {
            questionText: { en: q.questionText.en },
            options: q.options.map(opt => ({ en: opt.en }))
          };
          
          const duplicateInDB = existingQuestions.find(existing => 
            isDuplicateQuestion(existing, questionDataForCheck)
          );
          
          if (duplicateInDB) {
            isDuplicate = true;
            duplicateReason = "Question already exists in database";
          }
        }

        // Handle duplicate based on configuration
        if (isDuplicate) {
          if (skipDuplicates) {
            results.skipped.push({
              index: questionIndex,
              reason: duplicateReason,
              questionText: q.questionText.en
            });
            continue; // Skip this question and move to next
          } else {
            throw new Error(`Duplicate question detected: ${duplicateReason}`);
          }
        }

        // 🔥 Generate option IDs
        const optionsWithIds = q.options.map((opt) => ({
          id: randomUUID(),
          en: opt.en,
          hi: opt.hi || "",
          bn: opt.bn || ""
        }));

        // 🔥 Resolve correctAnswer → ID
        let correctOptionId = null;

        // CASE 1: correctAnswer is index
        if (typeof q.correctAnswer === "number") {
          if (q.correctAnswer < 0 || q.correctAnswer >= optionsWithIds.length) {
            throw new Error(`Question ${questionIndex}: Invalid correctAnswer index`);
          }
          correctOptionId = optionsWithIds[q.correctAnswer].id;
        }
        // CASE 2: correctAnswer is text (EN match)
        else if (typeof q.correctAnswer === "string") {
          const found = optionsWithIds.find(
            (opt) => opt.en === q.correctAnswer
          );
          if (!found) {
            throw new Error(`Question ${questionIndex}: Correct answer must match one of the option English texts`);
          }
          correctOptionId = found.id;
        }
        else {
          throw new Error(`Question ${questionIndex}: Invalid correctAnswer format`);
        }

        // Prepare question data with overrides
        const questionData = {
          questionText: {
            en: q.questionText.en,
            hi: q.questionText.hi || "",
            bn: q.questionText.bn || ""
          },
          questionImage: q.questionImage || "",
          options: optionsWithIds,
          correctAnswer: correctOptionId,
          subject: subject,
          topic: topic,
          difficulty: defaultDifficulty || q.difficulty || "easy",
          marks: defaultMarks !== undefined ? defaultMarks : (q.marks || 1),
          negativeMarks: defaultNegativeMarks !== undefined ? defaultNegativeMarks : (q.negativeMarks || 0),
          fact: {
            en: q.fact?.en || "",
            hi: q.fact?.hi || "",
            bn: q.fact?.bn || ""
          },
          createdBy: req.user.id
        };

        // Validate difficulty if provided
        const validDifficulties = ["easy", "medium", "hard"];
        if (questionData.difficulty && !validDifficulties.includes(questionData.difficulty)) {
          throw new Error(`Question ${questionIndex}: Invalid difficulty. Must be easy, medium, or hard`);
        }

        // Create question
        const question = await Question.create(questionData);
        
        results.successful.push({
          index: questionIndex,
          id: question._id,
          questionText: question.questionText.en
        });

        // Add the newly created question to existingQuestions array to prevent duplicates within the same batch
        if (checkAgainstDatabase) {
          existingQuestions.push({
            questionText: { en: questionData.questionText.en },
            options: questionData.options
          });
        }

      } catch (err) {
        results.failed.push({
          index: questionIndex,
          error: err.message,
          questionText: q.questionText?.en || 'Unknown',
          questionData: q
        });
      }
    }

    // Prepare response message
    let responseMessage = `Bulk upload completed: ${results.successful.length} successful`;
    if (results.skipped.length > 0) {
      responseMessage += `, ${results.skipped.length} skipped (duplicates)`;
    }
    if (results.failed.length > 0) {
      responseMessage += `, ${results.failed.length} failed`;
    }

    // Return summary
    res.status(201).json({
      msg: responseMessage,
      results: {
        successful: results.successful.length,
        skipped: results.skipped.length,
        failed: results.failed.length,
        total: results.total,
        details: results
      }
    });

  } catch (err) {
    res.status(500).json({
      msg: err.message
    });
  }
};

module.exports = {
  bulkCreateQuestions
};