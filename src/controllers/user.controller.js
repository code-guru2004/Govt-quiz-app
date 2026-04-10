const Test = require("../models/Test");
const Attempt = require("../models/Attempt");
const Question = require("../models/Question");

const getAvailableTests = async (req, res) => {
  try {
    const now = new Date();
    const userId = req.user.id;

    const tests = await Test.find({
      isPublished: true,
      startTime: { $lte: now },
      endTime: { $gte: now }
    })
      .select("-questions")
      .sort({ startTime: 1 });

    // 🔥 Get all attempts of this user
    const attempts = await Attempt.find({
      user: userId,
      test: { $in: tests.map(t => t._id) }
    }).sort({ createdAt: -1 }); // latest first

    // 🔥 Group attempts by test
    const attemptMap = {};

    attempts.forEach(a => {
      const testId = a.test.toString();

      if (!attemptMap[testId]) {
        attemptMap[testId] = {
          latest: a, // 🔥 latest attempt
          count: 0
        };
      }

      attemptMap[testId].count++;
    });

    // 🔥 Attach status
    const result = tests.map(test => {
      const data = attemptMap[test._id.toString()];

      let userTestStatus = "not-attempted";
      let attemptId = null;

      if (data) {
        const latest = data.latest;

        attemptId = latest._id;

        if (latest.status === "completed") {
          userTestStatus = "completed";
        } else {
          userTestStatus = "in-progress"; // paused or in-progress
        }
      }

      return {
        ...test.toObject(),
        attemptCount: data?.count || 0,
        userTestStatus,
        attemptId // 🔥 useful for resume
      };
    });

    res.json({
      tests: result
    });

  } catch (err) {
    res.status(500).json({ msg: err.message });
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

    // 🔁 Resume existing attempt (MOST IMPORTANT)
    const existingAttempt = await Attempt.findOne({
      user: userId,
      test: testId,
      status: { $in: ["in-progress", "paused"] }
    });

    if (existingAttempt) {
      return res.status(200).json({
        msg: "Resume existing attempt",
        attemptId: existingAttempt._id,
        resume: true
      });
    }

    // 🔢 Count ONLY completed attempts
    const completedAttempts = await Attempt.countDocuments({
      user: userId,
      test: testId,
      status: "completed"
    });

    if (
      test.maxAttempts !== -1 &&
      completedAttempts >= test.maxAttempts
    ) {
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

    // ⏱️ Secure timer
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
      expiresAt,
      status: "in-progress"
    });

    res.status(201).json({
      msg: "Test started successfully",
      attemptId: attempt._id,
      resume: false,
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
    const userId = req.user.id; // from auth middleware

    const test = await Test.findOne({
      _id: testId,
      isPublished: true
    }).populate("questions", "questionText options");

    if (!test) {
      return res.status(404).json({
        success: false,
        message: "Test not found"
      });
    }

    // 🔥 Get all attempts of this user for this test
    const attempts = await Attempt.find({ user: userId, test: testId });

    const attemptCount = attempts.length;

    // 🔥 Find active attempt (not submitted)
    const activeAttempt = attempts.find(a => a.status === "in-progress");

    let action = "start";

    if (activeAttempt) {
      action = "resume";
    } else if (attemptCount > 0) {
      action = "reattempt";
    }

    const canAttempt = attemptCount < test.maxAttempts;

    res.json({
      success: true,
      test,
      attemptInfo: {
        attemptCount,
        maxAttempts: test.maxAttempts,
        canAttempt,
        activeAttemptId: activeAttempt?._id || null,
        action
      }
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

module.exports = { getAvailableTests , startTest, pauseTest, resumeTest, getAttemptQuestions, saveAnswer, submitTest, getDetailedResult, getLeaderboard, getPublishedTests,getTestById};