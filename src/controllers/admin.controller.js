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

    // ✅ Validation
    if (!title || !duration || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        msg: "Required fields missing"
      });
    }

    if (duration <= 0) {
      return res.status(400).json({
        success: false,
        msg: "Duration must be greater than 0"
      });
    }

    if (new Date(startTime) >= new Date(endTime)) {
      return res.status(400).json({
        success: false,
        msg: "End time must be after start time"
      });
    }

    // ✅ Determine status
    let status = "scheduled";
    const now = new Date();

    if (now >= new Date(startTime) && now <= new Date(endTime)) {
      status = "active";
    } else if (now > new Date(endTime)) {
      status = "completed";
    }

    // ✅ Create test
    const test = await Test.create({
      title,
      description,
      duration,
      startTime,
      endTime,
      maxAttempts: maxAttempts || 1,
      allowResume: allowResume ?? false,
      shuffleQuestions: shuffleQuestions ?? false,
      showResultImmediately: showResultImmediately ?? false,
      createdBy: req.user.userId,
      status
    });

    res.status(201).json({
      success: true,
      msg: "Test created successfully",
      test
    });

  } catch (err) {
    res.status(500).json({
      success: false,
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

// get questions of a test
const getQuestions = async (req, res) => {
  try {
    let {
      search = "",
      subject,
      topic,
      page = 1,
      limit = 10
    } = req.query;

    console.log("Query params:", req.query);

    const pageNum = Number(page);
    const limitNum = Number(limit);

    let query = {};

    // 🔍 Search
    if (search) {
      query.questionText = {
        $regex: search,
        $options: "i"
      };
    }

    // 📚 Subject (FIXED)
    if (subject) {
      query.subject = subject.toLowerCase();
    }

    // 🧠 Topic (FIXED)
    if (topic) {
      query.topic = topic.toLowerCase();
    }

    const skip = (pageNum - 1) * limitNum;

    const questions = await Question.find(query)
      .select("-correctAnswer")
      .skip(skip)
      .limit(limitNum)
      .sort({ createdAt: -1 });
    console.log("Questions found:", questions);
    const total = await Question.countDocuments(query);

    res.json({
      success: true,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
      questions
    });

  } catch (err) {
    res.status(500).json({ msg: err.message });
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

const getAllTests = async (req, res) => {
  try {
    const tests = await Test.find().populate("questions", "questionText");
    console.log("Tests found:", tests);
    
    res.json({
      success: true,
      tests
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
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
      test
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
  makeTestActive ,
  getQuestions,
  getAllTests,
  getIndividualTestDetails
};
