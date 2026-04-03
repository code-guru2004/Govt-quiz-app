const Test = require("../models/Test");
const Attempt = require("../models/Attempt");
const Question = require("../models/Question");
const getAvailableTests = async (req, res) => {
  try {
    const now = new Date();

    // 🔥 Only show active tests within schedule
    const tests = await Test.find({
      isPublished: true,
      startTime: { $lte: now },
      endTime: { $gte: now }
    })
      .select("-questions") // don't send full question list
      .sort({ startTime: 1 });

    res.json({
      count: tests.length,
      tests
    }); 

  } catch (err) {
    res.status(500).json({
      msg: err.message
    });
  }
};

const startTest = async (req, res) => {
  try {
    const { testId } = req.params;
    const userId = req.user.id;

    const now = new Date();

    // 🔍 Get Test
    const test = await Test.findById(testId);

    if (!test) {
      return res.status(404).json({ msg: "Test not found" });
    }

    // ⛔ Check schedule
    if (now < test.startTime) {
      return res.status(400).json({
        msg: "Test has not started yet"
      });
    }

    if (now > test.endTime) {
      return res.status(400).json({
        msg: "Test has already ended"
      });
    }

    // 🔁 Resume existing attempt
    let existingAttempt = await Attempt.findOne({
        user: userId,
        test: testId,
        status: { $ne: "completed" }
      });
      
      if (existingAttempt) {
        return res.status(400).json({
          msg: "You must complete your previous attempt first",
          attemptId: existingAttempt._id
        });
      }

    // 🔢 Check max attempts
    const attemptCount = await Attempt.countDocuments({
      user: userId,
      test: testId
    });

    if (attemptCount >= test.maxAttempts) {
      return res.status(400).json({
        msg: "Maximum attempts reached"
      });
    }

    // 📦 Prepare question snapshot
    let questionList = [...test.questions];

    if (test.shuffleQuestions) {
      questionList.sort(() => Math.random() - 0.5);
    }

    const attemptQuestions = questionList.map((qId) => ({
      questionId: qId,
      selectedOption: null,
      isCorrect: null,
      isMarkedForReview: false,
      timeSpent: 0
    }));

    // ⏱️ Secure timer (backend controlled)
    const expiresAt = new Date(
      now.getTime() + test.duration * 60 * 1000
    );

    // ✅ Create Attempt
    const attempt = await Attempt.create({
      user: userId,
      test: testId,

      questions: attemptQuestions,

      totalQuestions: test.questions.length,
      totalMarks: test.totalMarks,
      negativeMarks: test.negativeMarks || 0,
      duration: test.duration,

      startedAt: now,
      expiresAt
    });

    res.status(201).json({
      msg: "Test started successfully",
      attemptId: attempt._id,
      expiresAt
    });

  } catch (err) {
    res.status(500).json({
      msg: err.message
    });
  }
};

const pauseTest = async (req, res) => {
  try {
    const { attemptId } = req.params;

    const attempt = await Attempt.findOne({
      _id: attemptId,
      user: req.user.id
    });

    if (!attempt) {
      return res.status(404).json({ msg: "Attempt not found" });
    }

    if (attempt.status === "completed") {
      return res.status(400).json({
        msg: "Test already completed"
      });
    }

    // ⏱️ Check if already expired
    if (new Date() > attempt.expiresAt) {
      attempt.status = "completed";
      await attempt.save();

      return res.status(400).json({
        msg: "Time is over"
      });
    }

    attempt.status = "paused";
    await attempt.save();

    res.json({
      msg: "Test paused successfully"
    });

  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

const resumeTest = async (req, res) => {
    try {
      const { attemptId } = req.params;
  
      const attempt = await Attempt.findOne({
        _id: attemptId,
        user: req.user.id
      });
  
      if (!attempt) {
        return res.status(404).json({ msg: "Attempt not found" });
      }
  
      if (attempt.status === "completed") {
        return res.status(400).json({
          msg: "Test already completed"
        });
      }
  
      // ⏱️ Check expiry
      if (new Date() > attempt.expiresAt) {
        attempt.status = "completed";
        await attempt.save();
  
        return res.status(400).json({
          msg: "Time is over"
        });
      }
  
      attempt.status = "in-progress";
      await attempt.save();
  
      // ⏳ Remaining time
      const remainingTime = Math.floor(
        (attempt.expiresAt - new Date()) / 1000
      );
  
      res.json({
        msg: "Resume test",
        attemptId: attempt._id,
        remainingTime,
        currentQuestionIndex: attempt.currentQuestionIndex
      });
  
    } catch (err) {
      res.status(500).json({ msg: err.message });
    }
};

const getAttemptQuestions = async (req, res) => {
  try {
    const { attemptId } = req.params;

    const attempt = await Attempt.findOne({
      _id: attemptId,
      user: req.user.id
    });

    if (!attempt) {
      return res.status(404).json({ msg: "Attempt not found" });
    }

    // ⏱️ Check expiry
    if (new Date() > attempt.expiresAt) {
      attempt.status = "completed";
      await attempt.save();

      return res.status(400).json({
        msg: "Time is over"
      });
    }

    // 🔥 Fetch questions (without correctAnswer)
    const questionIds = attempt.questions.map(q => q.questionId);

    const questions = await Question.find({
      _id: { $in: questionIds }
    }).select("-correctAnswer");

    // 🔁 Maintain order of questions
    const questionMap = {};
    questions.forEach(q => {
      questionMap[q._id] = q;
    });

    const orderedQuestions = attempt.questions.map(q => ({
      ...questionMap[q.questionId]?.toObject(),
      selectedOption: q.selectedOption,
      isMarkedForReview: q.isMarkedForReview
    }));

    // ⏳ Remaining time
    const remainingTime = Math.max(
      0,
      Math.floor((attempt.expiresAt - new Date()) / 1000)
    );

    res.json({
      attemptId: attempt._id,
      status: attempt.status,
      currentQuestionIndex: attempt.currentQuestionIndex,
      remainingTime,
      totalQuestions: attempt.totalQuestions,
      questions: orderedQuestions
    });

  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

const saveAnswer = async (req, res) => {
  try {
    const { attemptId } = req.params;

    const {
      questionId,
      selectedOption,
      timeSpent, // seconds spent on this question
      isMarkedForReview,
      currentQuestionIndex
    } = req.body;

    const attempt = await Attempt.findOne({
      _id: attemptId,
      user: req.user.id
    });

    if (!attempt) {
      return res.status(404).json({ msg: "Attempt not found" });
    }

    // ⏱️ Check expiry
    if (new Date() > attempt.expiresAt) {
      attempt.status = "completed";
      await attempt.save();

      return res.status(400).json({
        msg: "Time is over"
      });
    }

    if (attempt.status === "completed") {
      return res.status(400).json({
        msg: "Test already submitted"
      });
    }

    // 🔍 Find question in attempt
    const question = attempt.questions.find(
      (q) => q.questionId.toString() === questionId
    );

    if (!question) {
      return res.status(400).json({
        msg: "Invalid question"
      });
    }

    // ✅ Update fields
    if (selectedOption !== undefined) {
      question.selectedOption = selectedOption;
    }

    if (isMarkedForReview !== undefined) {
      question.isMarkedForReview = isMarkedForReview;
    }

    if (timeSpent) {
      question.timeSpent += timeSpent; // accumulate
    }

    // 🔄 Update index
    if (currentQuestionIndex !== undefined) {
      attempt.currentQuestionIndex = currentQuestionIndex;
    }

    await attempt.save();

    res.json({
      msg: "Answer saved successfully"
    });

  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

const submitTest = async (req, res) => {
  try {
    const { attemptId } = req.params;

    const attempt = await Attempt.findOne({
      _id: attemptId,
      user: req.user.id
    });

    if (!attempt) {
      return res.status(404).json({ msg: "Attempt not found" });
    }

    if (attempt.status === "completed") {
      return res.status(400).json({
        msg: "Test already submitted"
      });
    }

    // ⏱️ Force submit if time over
    if (new Date() > attempt.expiresAt) {
      attempt.status = "completed";
    }

    // 🔥 Get correct answers from DB
    const questionIds = attempt.questions.map(q => q.questionId);

    const questions = await Question.find({
        _id: { $in: questionIds }
      }).select("+correctAnswer");

    const questionMap = {};
    questions.forEach(q => {
      questionMap[q._id] = q;
    });

    let score = 0;
    let correctCount = 0;
    let wrongCount = 0;
    let unattempted = 0;

    // 🧠 Evaluate answers
    attempt.questions.forEach(q => {
      const actualQuestion = questionMap[q.questionId];

      if (!q.selectedOption) {
        unattempted++;
        return;
      }

      if (q.selectedOption === actualQuestion.correctAnswer) {
        q.isCorrect = true;
        score += actualQuestion.marks || 0;
        correctCount++;
      } else {
        q.isCorrect = false;
        score -= attempt.negativeMarks || 0;
        wrongCount++;
      }
    });

    // ✅ Finalize attempt
    attempt.score = score;
    attempt.status = "completed";
    attempt.submittedAt = new Date();

    await attempt.save();

    res.json({
      msg: "Test submitted successfully",
      result: {
        score,
        totalMarks: attempt.totalMarks,
        correct: correctCount,
        wrong: wrongCount,
        unattempted
      }
    });

  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

const getDetailedResult = async (req, res) => {
  try {
    const { attemptId } = req.params;

    const attempt = await Attempt.findOne({
      _id: attemptId,
      user: req.user.id
    });

    if (!attempt) {
      return res.status(404).json({ msg: "Attempt not found" });
    }

    if (attempt.status !== "completed") {
      return res.status(400).json({
        msg: "Test not submitted yet"
      });
    }

    // 🔥 Get full question data (including correctAnswer now)
    const questionIds = attempt.questions.map(q => q.questionId);

    const questions = await Question.find({
      _id: { $in: questionIds }
    });

    const questionMap = {};
    questions.forEach(q => {
      questionMap[q._id] = q;
    });

    const detailed = attempt.questions.map(q => {
      const actual = questionMap[q.questionId];

      return {
        questionId: q.questionId,
        questionText: actual.questionText,
        options: actual.options,

        selectedOption: q.selectedOption,
        correctAnswer: actual.correctAnswer,

        isCorrect: q.isCorrect,
        timeSpent: q.timeSpent
      };
    });

    res.json({
      score: attempt.score,
      totalMarks: attempt.totalMarks,
      questions: detailed
    });

  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

const getLeaderboard = async (req, res) => {
  try {
    const { testId } = req.params;

    const leaderboard = await Attempt.find({
      test: testId,
      status: "completed"
    })
      .populate("user", "name email")
      .sort({ score: -1, submittedAt: 1 }) // 🔥 tie breaker
      .limit(50);

    const result = leaderboard.map((a, index) => ({
      rank: index + 1,
      name: a.user.name,
      email: a.user.email,
      score: a.score,
      submittedAt: a.submittedAt
    }));

    res.json({
      leaderboard: result
    });

  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// get published tests for users
const getPublishedTests = async (req, res) => {
  try {
    const tests = await Test.find({ isPublished: true }).populate("questions", "questionText");
    console.log("Published tests found:", tests);

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

// get test by id for users
const getTestById = async (req, res) => {
  try {
    const { testId } = req.params;

    const test = await Test.findOne({ _id: testId, isPublished: true }).populate("questions", "questionText options");

    if (!test) { 
      return res.status(404).json({
        success: false,
        message: "Test not found"
      });
    }

    res.json({
      success: true,
      test
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

module.exports = { getAvailableTests , startTest, pauseTest, resumeTest, getAttemptQuestions, saveAnswer, submitTest, getDetailedResult, getLeaderboard, getPublishedTests,getTestById};