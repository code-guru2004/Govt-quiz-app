const { default: mongoose } = require("mongoose");
const Question = require("../models/Question");
const subjectModel = require("../models/subject.model");
const Test = require("../models/Test");
const topicModel = require("../models/topic.model");
const User = require("../models/User");
const { randomUUID } = require("crypto");

// create question -- {DONE}--{NEED}🟢
const createQuestion = async (req, res) => {
  try {
    const {
      questionText,   // { en, hi, bn }
      options,        // [{ en, hi, bn }]
      correctAnswer,  // can be index OR text (we'll convert)
      subject,
      topic,
      difficulty,
      marks,
      negativeMarks,
      fact,
    } = req.body;

    // 🔥 Basic validation
    if (!questionText?.en || !options || !subject || !topic) {
      return res.status(400).json({
        msg: "Question (EN), options, subject, and topic are required",
      });
    }

    if (!Array.isArray(options) || options.length < 2) {
      return res.status(400).json({
        msg: "At least 2 options required",
      });
    }

    // 🔥 Validate subject & topic IDs
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

    // 🔥 Validate options (must have EN at least)
    for (let opt of options) {
      if (!opt.en) {
        return res.status(400).json({
          msg: "Each option must have at least English text",
        });
      }
    }

    // 🔥 Generate option IDs
    const optionsWithIds = options.map((opt) => ({
      id: randomUUID(),
      en: opt.en,
      hi: opt.hi || "",
      bn: opt.bn || "",
    }));

    // 🔥 Resolve correctAnswer → ID
    let correctOptionId = null;

    // CASE 1: correctAnswer is index
    if (typeof correctAnswer === "number") {
      if (correctAnswer < 0 || correctAnswer >= optionsWithIds.length) {
        return res.status(400).json({
          msg: "Invalid correctAnswer index",
        });
      }
      correctOptionId = optionsWithIds[correctAnswer].id;
    }

    // CASE 2: correctAnswer is text (EN match)
    else if (typeof correctAnswer === "string") {
      const found = optionsWithIds.find(
        (opt) => opt.en === correctAnswer
      );

      if (!found) {
        return res.status(400).json({
          msg: "Correct answer must match one of the option English texts",
        });
      }

      correctOptionId = found.id;
    }

    // CASE 3: already ID (future safe)
    else {
      return res.status(400).json({
        msg: "Invalid correctAnswer format",
      });
    }

    // ✅ Create question
    const question = await Question.create({
      questionText,
      options: optionsWithIds,
      correctAnswer: correctOptionId,
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

// create test -- {DONE}--{NO NEED}🔴
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

// add questions to test -- {DONE}--{NO NEED}🔴
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

// get filter questions of a test with search and pagination -- {DONE} --{NEED}🟢
const getQuestions = async (req, res) => {
  try {
    let {
      search = "",
      page = 1,
      limit = 10,
      testId,
      subjectId,   // 🔥 from frontend (for sectional)
      topicId      // 🔥 from frontend
    } = req.query;

    if (!testId) {
      return res.status(400).json({
        success: false,
        msg: "testId is required",
      });
    }

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 10));

    // 🔥 1. Get test
    const test = await Test.findById(testId).lean();

    if (!test) {
      return res.status(404).json({
        success: false,
        msg: "Test not found",
      });
    }

    let query = {};

    // 🔥 2. Collect ALL existing question IDs (flat + sections)
    let existingQuestionIds = [];

    if (test.hasSections) {
      existingQuestionIds = test.sections.flatMap(s => s.questions);
    } else {
      existingQuestionIds = test.questions;
    }

    if (existingQuestionIds.length > 0) {
      query._id = { $nin: existingQuestionIds };
    }

    // 🔥 3. Base filtering by test type

    if (!test.hasSections) {
      // ✅ NON-SECTIONAL

      if (test.testType === "topic") {
        query.subject = test.subject;
        query.topic = test.topic;
      }

      if (test.testType === "subject") {
        query.subject = test.subject;
      }

      if (test.testType === "full-length") {
        query.subject = { $in: test.subjects };
      }

    } else {
      // ✅ SECTIONAL TEST (Frontend-driven filters)

      if (subjectId) {
        // 🔥 Validate subject belongs to test.subjects
        const isValidSubject = test.subjects.some(
          s => s.toString() === subjectId
        );

        if (!isValidSubject) {
          return res.status(400).json({
            success: false,
            msg: "Selected subject does not belong to this test",
          });
        }

        query.subject = subjectId;
      } else {
        // fallback → allow all test subjects
        query.subject = { $in: test.subjects };
      }

      if (topicId) {
        query.topic = topicId;
      }
    }

    // 🔍 4. Search
    if (search) {
      query.questionText = {
        $regex: search,
        $options: "i",
      };
    }

    const skip = (pageNum - 1) * limitNum;

    // 🔥 5. Fetch questions
    const questions = await Question.find(query)
      .select("questionText options difficulty marks subject topic")
      .skip(skip)
      .limit(limitNum)
      .sort({ createdAt: -1 })
      .populate("subject", "name")
      .populate("topic", "name")
      .lean();

    const total = await Question.countDocuments(query);

    return res.json({
      success: true,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
      questions,
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      msg: err.message,
    });
  }
};

// make it public or private -- {DONE} --{NEED}🟢
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

// get all tests with basic details -- {DONE}--{No NEED}🔴
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

// get individual test details -- {DONE} --{NEED}🟢
const getIndividualTestDetails = async (req, res) => {
  try {
    const { testId } = req.params;

    // =========================
    // ✅ VALIDATE OBJECT ID
    // =========================
    if (!mongoose.Types.ObjectId.isValid(testId)) {
      return res.status(400).json({
        success: false,
        msg: "Invalid Test ID"
      });
    }

    // =========================
    // 🚀 FETCH TEST WITH POPULATION
    // =========================
    const test = await Test.findById(testId)
      .select(`
        title description duration totalMarks
        maxAttempts testType hasSections
        questions sections
        subject topic subjects
        startTime endTime
      `)

      // 🔹 Test level populate
      .populate("subject", "name")
      .populate("topic", "name")
      .populate("subjects", "name")

      // 🔹 Flat questions
      .populate({
        path: "questions",
        select: "questionText options subject topic marks difficulty",
        populate: [
          { path: "subject", select: "name" },
          { path: "topic", select: "name" }
        ]
      })

      // 🔹 Section questions
      .populate({
        path: "sections.questions",
        select: "questionText options subject topic marks difficulty",
        populate: [
          { path: "subject", select: "name" },
          { path: "topic", select: "name" }
        ]
      })

      .lean();

    if (!test) {
      return res.status(404).json({
        success: false,
        msg: "Test not found"
      });
    }

    // =========================
    // 🎯 SUBJECT HANDLING
    // =========================
    let subjectsData;

    if (test.testType === "full") {
      subjectsData = test.subjects?.map(s => s.name) || [];
    } else {
      subjectsData = test.subject?.name || null;
    }

    // =========================
    // 📊 CALCULATIONS
    // =========================
    let totalMarksCalculated = 0;

    const difficultyStats = {
      easy: 0,
      medium: 0,
      hard: 0
    };

    const processQuestions = (questions = []) => {
      questions.forEach(q => {
        // total marks
        totalMarksCalculated += q.marks || 0;

        // difficulty
        if (q.difficulty === "easy") difficultyStats.easy++;
        else if (q.difficulty === "medium") difficultyStats.medium++;
        else if (q.difficulty === "hard") difficultyStats.hard++;
      });
    };

    // =========================
    // 📦 BASE RESPONSE
    // =========================
    const formattedTest = {
      _id: test._id,
      title: test.title,
      description: test.description,

      duration: test.duration,

      // 🔥 CALCULATED
      totalMarks: totalMarksCalculated,
      totalQuestions: 0,

      maxAttempts: test.maxAttempts,

      testType: test.testType,
      hasSections: test.hasSections,

      subject: subjectsData,
      topic: test.topic?.name || null,

      startTime: test.startTime,
      endTime: test.endTime,

      difficultyStats
    };

    // =========================
    // ✅ FLAT TEST
    // =========================
    if (!test.hasSections) {
      processQuestions(test.questions);

      formattedTest.totalQuestions = test.questions.length;

      formattedTest.questions = test.questions;
    }

    // =========================
    // ✅ SECTIONAL TEST
    // =========================
    else {
      let totalQuestions = 0;

      formattedTest.sections = test.sections.map(section => {
        let sectionMarks = 0;

        const sectionStats = {
          easy: 0,
          medium: 0,
          hard: 0
        };

        section.questions.forEach(q => {
          totalQuestions++;

          // overall stats
          totalMarksCalculated += q.marks || 0;

          if (q.difficulty === "easy") {
            difficultyStats.easy++;
            sectionStats.easy++;
          } else if (q.difficulty === "medium") {
            difficultyStats.medium++;
            sectionStats.medium++;
          } else if (q.difficulty === "hard") {
            difficultyStats.hard++;
            sectionStats.hard++;
          }

          // section marks
          sectionMarks += q.marks || 0;
        });

        return {
          title: section.title,
          duration: section.duration,
          totalMarks: sectionMarks,
          totalQuestions: section.questions.length,
          difficultyStats: sectionStats,
          questions: section.questions
        };
      });

      formattedTest.totalQuestions = totalQuestions;
      formattedTest.totalMarks = totalMarksCalculated;
    }

    // =========================
    // ✅ RESPONSE
    // =========================
    res.json({
      success: true,
      test: formattedTest
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      msg: err.message
    });
  }
};



// remove question from test -- {DONE} --{NO NEED}🔴
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


// get dashboard stats -- {DONE}🟢
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
