const Question = require("../models/Question");
const Test = require("../models/Test");

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
      negativeMarks
    } = req.body;

    // 🔥 Basic validation
    if (!questionText || !options || !correctAnswer || !subject || !topic) {
      return res.status(400).json({
        msg: "All required fields must be provided"
      });
    }

    if (options.length < 2) {
      return res.status(400).json({
        msg: "At least 2 options required"
      });
    }

    if (!options.includes(correctAnswer)) {
      return res.status(400).json({
        msg: "Correct answer must be one of the options"
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
      createdBy: req.user.id
    });

    res.status(201).json({
      msg: "Question created successfully",
      question
    });

  } catch (err) {
    res.status(500).json({
      msg: err.message
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
      showResultImmediately
    } = req.body;

    // 🔥 Validation
    if (!title || !duration || !startTime || !endTime) {
      return res.status(400).json({
        msg: "Required fields missing"
      });
    }

    if (new Date(startTime) >= new Date(endTime)) {
      return res.status(400).json({
        msg: "End time must be after start time"
      });
    }

    // ✅ Create Test
    const test = await Test.create({
      title,
      description,
      duration,
      startTime,
      endTime,
      maxAttempts,
      allowResume,
      shuffleQuestions,
      showResultImmediately,
      createdBy: req.user.id
    });

    res.status(201).json({
      msg: "Test created successfully",
      test
    });

  } catch (err) {
    res.status(500).json({
      msg: err.message
    });
  }
};


const addQuestionsToTest = async (req, res) => {
  try {
    const { testId } = req.params;
    const { questionIds } = req.body;

    if (!questionIds || !Array.isArray(questionIds)) {
      return res.status(400).json({
        msg: "questionIds must be an array"
      });
    }

    // 🔍 Check test exists
    const test = await Test.findById(testId);
    if (!test) {
      return res.status(404).json({ msg: "Test not found" });
    }
    console.log("Test found:", test);

    // 🔍 Fetch valid questions
    const questions = await Question.find({
      _id: { $in: questionIds }
    });

    if (questions.length !== questionIds.length) {
      return res.status(400).json({
        msg: "Some question IDs are invalid"
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
    const totalMarks = questions.reduce(
      (sum, q) => sum + (q.marks || 0),
      test.totalMarks || 0
    );

    test.totalMarks = totalMarks;

    await test.save();

    res.json({
      msg: "Questions added successfully",
      totalQuestions: test.questions.length,
      totalMarks: test.totalMarks
    });

  } catch (err) {
    res.status(500).json({
      msg: err.message
    });
  }
};

const makeTestActive = async (req, res) => {
  try {
    const { testId } = req.params;
    
    if(!testId){
      return res.status(400).json({ msg: "Test ID is required" });
    }
    const test = await Test.findById(testId);

    if (!test) {
      return res.status(404).json({ msg: "Test not found" });
    }

    test.isPublished= true;
    await test.save();

    res.json({
      msg: "Test is now active",
      test
    });

  } catch (err) {
    res.status(500).json({
      msg: err.message
    });
  }

};

module.exports = {
  createQuestion,
  createTest,
  addQuestionsToTest,
  makeTestActive  
};
