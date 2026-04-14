const { default: mongoose } = require("mongoose");
const Question = require("../models/Question");
const subjectModel = require("../models/subject.model");
const Test = require("../models/Test");
const topicModel = require("../models/topic.model");
const User = require("../models/User");
const createQuestion = async (req, res) => {
  try {
    const {
      questionText,
      options,
      correctAnswer,
      subject,
      topic,
      difficulty,
      marks,
      negativeMarks,
      fact,
    } = req.body;

    // 🔥 Basic validation
    if (!questionText || !options || !correctAnswer || !subject || !topic) {
      return res.status(400).json({
        msg: "All required fields must be provided",
      });
    }

    if (
      !mongoose.Types.ObjectId.isValid(subject) ||
      !mongoose.Types.ObjectId.isValid(topic)
    ) {
      return res.status(400).json({
        msg: "Invalid subject or topic ID format",
      });
    }
    const subjectExists = await subjectModel.findById(subject);
    const topicExists = await topicModel.findById(topic);

    if (!subjectExists || !topicExists) {
      return res.status(400).json({
        msg: "Invalid subject or topic",
      });
    }

    if (topicExists.subject.toString() !== subject) {
      return res.status(400).json({
        msg: "Topic does not belong to selected subject",
      });
    }

    if (options.length < 2) {
      return res.status(400).json({
        msg: "At least 2 options required",
      });
    }

    if (!options.includes(correctAnswer)) {
      return res.status(400).json({
        msg: "Correct answer must be one of the options",
      });
    }

    // ✅ Create question
    const question = await Question.create({
      questionText,
      options,
      correctAnswer,
      subject,
      topic,
      difficulty,
      marks,
      negativeMarks,
      fact,
      createdBy: req.user.id,
    });

    res.status(201).json({
      msg: "Question created successfully",
      question,
    });
  } catch (err) {
    res.status(500).json({
      msg: err.message,
    });
  }
};

const createTest = async (req, res) => {
  try {
    const {
      title,
      description,
      duration,
      startTime,
      endTime,
      maxAttempts,
      allowResume,
      shuffleQuestions,
      showResultImmediately,
      testType,
      subject,
      topic,
      subjects,
      isPublished
    } = req.body;

    // Basic validation
    if (!title || !duration || !startTime || !endTime || !testType) {
      return res.status(400).json({
        success: false,
        msg: "Required fields missing",
      });
    }

    if (duration <= 0) {
      return res.status(400).json({
        success: false,
        msg: "Duration must be greater than 0",
      });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (start >= end) {
      return res.status(400).json({
        success: false,
        msg: "End time must be after start time",
      });
    }

    // Type-based validation
    if (testType === "topic" && (!subject || !topic)) {
      return res.status(400).json({
        success: false,
        msg: "Subject and topic required for topic test",
      });
    }

    if (testType === "subject" && !subject) {
      return res.status(400).json({
        success: false,
        msg: "Subject required for subject test",
      });
    }

    if (testType === "full" && (!subjects || subjects.length === 0)) {
      return res.status(400).json({
        success: false,
        msg: "At least one subject required for full test",
      });
    }

    const test = await Test.create({
      title,
      description,
      duration,
      startTime: start,
      endTime: end,
      maxAttempts: maxAttempts || 1,
      allowResume: allowResume ?? false,
      shuffleQuestions: shuffleQuestions ?? false,
      showResultImmediately: showResultImmediately ?? false,

      testType,
      subject: subject || null,
      topic: topic || null,
      subjects: subjects || [],
      isPublished: isPublished ?? false,

      createdBy: req.user.userId,
    });

    res.status(201).json({
      success: true,
      msg: "Test created successfully",
      test,
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      msg: err.message,
    });
  }
};

const addQuestionsToTest = async (req, res) => {
  try {
    const { testId } = req.params;
    const { questionIds } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(testId)) {
      return res.status(400).json({ msg: "Invalid test ID" });
    }
    if (!questionIds || !Array.isArray(questionIds)) {
      return res.status(400).json({
        msg: "questionIds must be an array",
      });
    }

    // 🔍 Check test exists
    const test = await Test.findById(testId);
    if (!test) {
      return res.status(404).json({ msg: "Test not found" });
    }

    // 🔍 Fetch valid questions
    const questions = await Question.find({
      _id: { $in: questionIds },
    });

    if (questions.length !== questionIds.length) {
      return res.status(400).json({
        msg: "Some question IDs are invalid",
      });
    }

    // 🔥 Remove duplicates
    const existingIds = test.questions.map((q) => q.toString());

    const newQuestionIds = questionIds.filter(
      (id) => !existingIds.includes(id)
    );

    // ✅ Add to test
    test.questions.push(...newQuestionIds);

    // 🔥 Recalculate total marks
    // recalculate from ALL questions in test
    const allQuestions = await Question.find({
      _id: { $in: test.questions },
    });

    test.totalMarks = allQuestions.reduce((sum, q) => sum + (q.marks || 0), 0);

    //test.totalMarks = totalMarks;

    await test.save();

    res.json({
      msg: "Questions added successfully",
      totalQuestions: test.questions.length,
      totalMarks: test.totalMarks,
    });
  } catch (err) {
    res.status(500).json({
      msg: err.message,
    });
  }
};

// get questions of a test
const getQuestions = async (req, res) => {
  try {
    let { search = "", page = 1, limit = 10, testId } = req.query;

    if (!testId) {
      return res.status(400).json({
        success: false,
        msg: "testId is required",
      });
    }

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 10));

    // 🔥 1. Get test
    const test = await Test.findById(testId);

    if (!test) {
      return res.status(404).json({
        success: false,
        msg: "Test not found",
      });
    }

    let query = {};

    // 🚫 2. Exclude already added questions
    if (test.questions.length > 0) {
      query._id = { $nin: test.questions };
    }

    // 🎯 3. Apply test type filtering
    if (test.testType === "topic") {
      query.subject = test.subject;
      query.topic = test.topic;
    }

    if (test.testType === "subject") {
      query.subject = test.subject;
    }

    if (test.testType === "full") {
      query.subject = { $in: test.subjects };
    }

    // 🔍 4. Search
    if (search) {
      query.questionText = {
        $regex: search,
        $options: "i",
      };
    }

    const skip = (pageNum - 1) * limitNum;

    const questions = await Question.find(query)
      .select("-correctAnswer")
      .skip(skip)
      .limit(limitNum)
      .sort({ createdAt: -1 })
      .populate("subject", "name")
      .populate("topic", "name");

    const total = await Question.countDocuments(query);

    res.json({
      success: true,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
      questions,
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      msg: err.message,
    });
  }
};

const makeTestStateChange = async (req, res) => {
  try {
    const { testId } = req.params;

    if (!testId) {
      return res.status(400).json({ msg: "Test ID is required" });
    }
    const test = await Test.findById(testId);

    if (!test) {
      return res.status(404).json({ msg: "Test not found" });
    }

    test.isPublished = !test.isPublished;
    await test.save();

    res.json({
      msg: test.isPublished ? "Test is now public" : "Test is now private",
      test,
    });
  } catch (err) {
    res.status(500).json({
      msg: err.message,
    });
  }
};

const getAllTests = async (req, res) => {
  try {
    const tests = await Test.find().populate("questions", "questionText").sort({ createdAt: -1 });
    

    res.json({
      success: true,
      tests,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// get individual test details
const getIndividualTestDetails = async (req, res) => {
  try {
    const { testId } = req.params;
    if (!testId) {
      return res.status(400).json({ msg: "Test ID is required" });
    }

    const test = await Test.findById(testId).populate("questions");
    if (!test) {
      return res.status(404).json({ msg: "Test not found" });
    }

    res.json({
      success: true,
      test,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      msg: err.message,
    });
  }
};


const removeQuestionFromTest = async (req, res) => {
  try {
    const { testId, questionId } = req.params;

    const updatedTest = await Test.findByIdAndUpdate(
      testId,
      { $pull: { questions: questionId } },
      { new: true }
    );

    if (!updatedTest) {
      return res.status(404).json({
        success: false,
        msg: "Test not found",
      });
    }

    res.json({
      success: true,
      msg: "Question removed successfully",
      questionsCount: updatedTest.questions.length,
    });

  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};



const getDashboardStats = async (req, res) => {
  try {
    const [
      totalQuestions,
      totalTests,
      totalUsers,
      totalPublishedTests,
      totalSubjects,
      totalTopics
    ] = await Promise.all([
      Question.countDocuments(),
      Test.countDocuments(),
      User.countDocuments(),
      Test.countDocuments({ isPublished: true }),
      subjectModel.countDocuments(),
      topicModel.countDocuments()
    ]);

    res.json({
      success: true,
      stats: {
        totalQuestions,
        totalTests,
        totalUsers,
        totalPublishedTests,
        totalSubjects,
        totalTopics
      }
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      msg: err.message
    });
  }
};



module.exports = {
  createQuestion,
  createTest,
  addQuestionsToTest,
  makeTestStateChange,
  getQuestions,
  getAllTests,
  getIndividualTestDetails,
  removeQuestionFromTest,
  getDashboardStats
};
