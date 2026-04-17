const Test = require("../models/Test");
const Attempt = require("../models/Attempt");
const Question = require("../models/Question");
const User = require("../models/User");
const mongoose = require("mongoose");
// utility fuction:
const syncRemainingTime = (attempt) => {
  if (
    attempt.status === "in-progress" &&
    attempt.lastResumedAt
  ) {
    const now = new Date();
    const last = new Date(attempt.lastResumedAt);

    // 🛑 Prevent duplicate sync in same time window
    if (now <= last) return;

    const timeSpent = Math.floor((now - last) / 1000);

    if (timeSpent > 0) {
      attempt.remainingTime -= timeSpent;
      attempt.remainingTime = Math.max(0, attempt.remainingTime);

      attempt.lastResumedAt = now; // ✅ checkpoint reset
    }
  }
};
// actual controllers
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

    const test = await Test.findById(testId).populate("questions", "questionText options correctAnswer marks");
    if (!test) {
      return res.status(404).json({ msg: "Test not found" });
    }

    if (now < test.startTime) {
      return res.status(400).json({ msg: "Test has not started yet" });
    }

    if (now > test.endTime) {
      return res.status(400).json({ msg: "Test has already ended" });
    }

    const existingAttempt = await Attempt.findOne({
      user: userId,
      test: testId,
      status: { $in: ["in-progress", "paused"] }
    });

    if (existingAttempt) {
      // ✅ ONLY ONE SYNC CALL
      syncRemainingTime(existingAttempt);

      if (existingAttempt.remainingTime <= 0) {
        existingAttempt.status = "completed";
      }

      await existingAttempt.save();

      return res.status(200).json({
        msg: "Resume existing attempt",
        attemptId: existingAttempt._id,
        resume: true,
        remainingTime: existingAttempt.remainingTime
      });
    }

    const completedAttempts = await Attempt.countDocuments({
      user: userId,
      test: testId,
      status: "completed"
    });

    if (test.maxAttempts !== -1 && completedAttempts >= test.maxAttempts) {
      return res.status(400).json({ msg: "Maximum attempts reached" });
    }

    let questionList = [...test.questions];
    
    if (test.shuffleQuestions) {
      for (let i = questionList.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [questionList[i], questionList[j]] = [questionList[j], questionList[i]];
      }
    }

    const attemptQuestions = questionList.map((question) => ({
      questionId: question._id,
      selectedOption: null,
      correctOption: question.correctAnswer, // 🔥 Store correct answer for later result calculation
      isCorrect: null,
      isMarkedForReview: false,
      timeSpent: 0
    }));

    

    const durationInSeconds = test.duration * 60;

    const attempt = await Attempt.create({
      user: userId,
      test: testId,
      questions: attemptQuestions,
      totalQuestions: test.questions.length,
      totalMarks: test.totalMarks,
      negativeMarks: test.negativeMarks || 0,
      duration: test.duration,
      startedAt: now,
      remainingTime: durationInSeconds,
      lastResumedAt: now,
      status: "in-progress"
    });

    res.status(201).json({
      msg: "Test started successfully",
      attemptId: attempt._id,
      resume: false,
      remainingTime: durationInSeconds
    });

  } catch (err) {
    res.status(500).json({ msg: err.message });
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

    if (attempt.status !== "in-progress") {
      return res.status(400).json({
        msg: "Test is not running"
      });
    }

    // ✅ ONLY ONE SYNC
    syncRemainingTime(attempt);

    if (attempt.remainingTime <= 0) {
      attempt.status = "completed";
      await attempt.save();

      return res.status(400).json({ msg: "Time is over" });
    }

    attempt.status = "paused";
    attempt.lastResumedAt = null; // 🔥 CRITICAL

    await attempt.save();

    res.json({
      msg: "Test paused successfully",
      remainingTime: attempt.remainingTime
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

    if (attempt.status !== "paused") {
      return res.status(400).json({
        msg: "Test is not paused"
      });
    }

    if (attempt.remainingTime <= 0) {
      attempt.status = "completed";
      await attempt.save();

      return res.status(400).json({ msg: "Time is over" });
    }

    // ❌ NO SYNC HERE (very important)

    attempt.status = "in-progress";
    attempt.lastResumedAt = new Date();

    await attempt.save();

    res.json({
      msg: "Resume test",
      attemptId: attempt._id,
      remainingTime: attempt.remainingTime,
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

    // ✅ SYNC TIME
    syncRemainingTime(attempt);

    // ⛔ Time over
    if (attempt.remainingTime <= 0) {
      attempt.status = "completed";
      await attempt.save();

      return res.status(400).json({ msg: "Time is over" });
    }

    await attempt.save(); // save updated time

    const questionIds = attempt.questions.map(q => q.questionId);
    
    const questions = await Question.find({
      _id: { $in: questionIds }
    }).select("-correctAnswer");

    const questionMap = {};
    questions.forEach(q => {
      questionMap[q._id] = q;
    });

    const orderedQuestions = attempt.questions.map(q => ({
      ...questionMap[q.questionId]?.toObject(),
      selectedOption: q.selectedOption,
      isMarkedForReview: q.isMarkedForReview
    }));

    res.json({
      attemptId: attempt._id,
      userEmail: req.user.email,
      userId: req.user.id,
      status: attempt.status,
      currentQuestionIndex: attempt.currentQuestionIndex,
      remainingTime: attempt.remainingTime, // ✅ FIXED
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
      selectedOption, // ✅ now option ID
      timeSpent,
      isMarkedForReview,
      currentQuestionIndex
    } = req.body;
    
    const attempt = await Attempt.findOne({
      _id: attemptId,
      user: req.user.id
    }).populate("questions.questionId", "options correctAnswer marks"); // 🔥 populate questions for validation
    
    if (!attempt) {
      return res.status(404).json({ msg: "Attempt not found" });
    }

    // ✅ SYNC TIMER
    syncRemainingTime(attempt);

    if (attempt.remainingTime <= 0) {
      attempt.status = "completed";
      await attempt.save();

      return res.status(400).json({ msg: "Time is over" });
    }

    if (attempt.status === "completed") {
      return res.status(400).json({
        msg: "Test already submitted"
      });
    }
    
    //console.log(attempt.questions);
    const question = attempt.questions.find(
      (q) => q.questionId._id.toString() === questionId
    );

    if (!question) {
      return res.status(400).json({ msg: "Invalid question" });
    }
   
    //✅ Validate selectedOption (OPTION ID)
    if (selectedOption !== undefined) {
      const options = question.questionId.options;
      const isValidOption = options.some(
        (opt) => opt.id === selectedOption
      );
      
      if (!isValidOption) {
        return res.status(400).json({
          msg: "Invalid option selected"
        });
      }
    
      question.selectedOption = selectedOption;
    
      // 🔥 Optional: set correctness immediately
      question.isCorrect =
        question.questionId.correctAnswer === selectedOption;
    }

    // if (selectedOption !== undefined) {
    //   question.selectedOption = selectedOption;
    // }

    if (isMarkedForReview !== undefined) {
      question.isMarkedForReview = isMarkedForReview;
    }

    if (timeSpent) {
      question.timeSpent += timeSpent;
    }

    if (currentQuestionIndex !== undefined) {
      attempt.currentQuestionIndex = currentQuestionIndex;
    }

    await attempt.save();

    res.json({ msg: "Answer saved successfully" });

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

    // ✅ FINAL SYNC
    syncRemainingTime(attempt);

    if (attempt.remainingTime <= 0) {
      attempt.status = "completed";
    }

    const questionIds = attempt.questions.map(q => q.questionId);

    const questions = await Question.find({
      _id: { $in: questionIds }
    }).select("+correctAnswer");

    const questionMap = {};
    questions.forEach(q => {
      questionMap[q._id.toString()] = q;
    });

    let score = 0;
    let correctCount = 0;
    let wrongCount = 0;
    let unattempted = 0;

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

// get detailed result of an attempt (with correct answers)
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
    }).select("+correctAnswer");

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

    const leaderboard = await Attempt.aggregate([
      {
        $match: {
          test: new mongoose.Types.ObjectId(testId),
          status: "completed"
        }
      },

      // 🔥 Sort so oldest attempt comes first
      {
        $sort: { submittedAt: 1 }
      },

      // 🔥 Group by user → pick FIRST attempt
      {
        $group: {
          _id: "$user",
          attempt: { $first: "$$ROOT" }
        }
      },

      // 🔥 Replace root with attempt object
      {
        $replaceRoot: { newRoot: "$attempt" }
      },

      // 🔥 Now apply leaderboard ranking logic
      {
        $sort: { score: -1, submittedAt: 1 }
      },

      {
        $limit: 50
      },

      // 🔥 Join user data
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "user"
        }
      },
      {
        $unwind: "$user"
      },

      // 🔥 Final shape
      {
        $project: {
          score: 1,
          submittedAt: 1,
          "user.name": 1,
          "user.email": 1
        }
      }
    ]);

    // ✅ Add rank
    const result = leaderboard.map((a, index) => ({
      rank: index + 1,
      name: a.user.name,
      email: a.user.email,
      score: a.score,
      submittedAt: a.submittedAt
    }));

    res.json({ leaderboard: result });

  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// get published tests for users
const getPublishedTests = async (req, res) => {
  try {
    const tests = await Test.find({ isPublished: true }).populate("questions", "questionText");

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
    }).populate("questions", "questionText options").populate("subject", "name").populate("topic", "name").populate("subjects", "name");

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
    const activeAttempt = attempts.find(
      a => a.status === "in-progress" || a.status === "paused"
    );

    let action = "start";

    if (activeAttempt) {
      action = "resume";
    } else if (attemptCount > 0) {
      action = "reattempt";
    }

    const canAttempt = test.maxAttempts === -1 || attemptCount < test.maxAttempts;

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

const getMyResults = async (req, res) => {
  try {
    const userId = req.user.id;

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;

    const skip = (page - 1) * limit;

    const results = await Attempt.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
          status: "completed"
        }
      },
    
      { $sort: { submittedAt: -1 } },
    
      // 🔥 JOIN with Test collection
      {
        $lookup: {
          from: "tests", // collection name (IMPORTANT: lowercase plural)
          localField: "test",
          foreignField: "_id",
          as: "testData"
        }
      },
    
      { $unwind: "$testData" },
    
      {
        $group: {
          _id: "$test",
          title: { $first: "$testData.title" }, // ✅ FIXED
          attempts: {
            $push: {
              attemptId: "$_id",
              score: "$score",
              totalMarks: "$totalMarks",
              submittedAt: "$submittedAt"
            }
          },
          latestAttempt: { $first: "$submittedAt" }
        }
      },
    
      { $sort: { latestAttempt: -1 } },
    
      {
        $facet: {
          metadata: [{ $count: "total" }],
          data: [{ $skip: skip }, { $limit: limit }]
        }
      }
    ]);

    const total = results[0].metadata[0]?.total || 0;

    // ✅ Final formatting
    const formatted = results[0].data.map(item => ({
      testId: item._id,
      title: item.title,
      attempts: item.attempts
    }));

    res.json({
      success: true,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      data: formatted
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch results",
      error: error.message
    });
  }
};

// Get complete user dashboard data
const getUserDashboard = async (req, res) => {
  try {
    const userId = req.user.id; // From auth middleware

    // 1. Fetch user personal details (exclude password)
    const user = await User.findById(userId)
      .select("-password")
      .populate("bookmarks", "title description duration"); // Populate bookmarks if needed

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // 2. Fetch all test attempts with populated test details
    const allAttempts = await Attempt.find({ user: userId, status: "completed" })
      .populate({
        path: "test",
        select: "title description duration totalMarks subject topic",
        populate: {
          path: "subject topic",
          select: "name"
        }
      })
      .sort({ submittedAt: -1 }); // Most recent first

    // 3. Latest 3 test attempts
    const latestThreeAttempts = allAttempts.slice(0, 3);

    // 4. Test statistics
    const totalTestsAttempted = allAttempts.length;
    
    const testStats = {
      totalTests: totalTestsAttempted,
      totalScore: 0,
      totalMarks: 0,
      averageScore: 0,
      bestScore: 0,
      worstScore: Infinity,
      subjectWiseStats: {},
      passCount: 0,
      failCount: 0
    };

    // Calculate statistics
    let bestScore = 0;
    let worstScore = Infinity;
    let totalScoreSum = 0;
    let totalMarksSum = 0;

    allAttempts.forEach(attempt => {
      const percentage = (attempt.score / attempt.totalMarks) * 100;
      
      totalScoreSum += attempt.score;
      totalMarksSum += attempt.totalMarks;
      
      if (percentage > bestScore) bestScore = percentage;
      if (percentage < worstScore) worstScore = percentage;
      
      // Count passes/fails (assuming 40% as passing mark)
      if (percentage >= 40) {
        testStats.passCount++;
      } else {
        testStats.failCount++;
      }

      // Subject-wise statistics
      if (attempt.test && attempt.test.subject) {
        const subjectName = attempt.test.subject.name;
        if (!testStats.subjectWiseStats[subjectName]) {
          testStats.subjectWiseStats[subjectName] = {
            attempts: 0,
            totalScore: 0,
            totalMarks: 0,
            averagePercentage: 0
          };
        }
        testStats.subjectWiseStats[subjectName].attempts++;
        testStats.subjectWiseStats[subjectName].totalScore += attempt.score;
        testStats.subjectWiseStats[subjectName].totalMarks += attempt.totalMarks;
        testStats.subjectWiseStats[subjectName].averagePercentage = 
          (testStats.subjectWiseStats[subjectName].totalScore / 
           testStats.subjectWiseStats[subjectName].totalMarks) * 100;
      }
    });

    testStats.totalScore = totalScoreSum;
    testStats.totalMarks = totalMarksSum;
    testStats.averageScore = totalTestsAttempted > 0 
      ? (totalScoreSum / totalMarksSum) * 100 
      : 0;
    testStats.bestScore = totalTestsAttempted > 0 ? bestScore : 0;
    testStats.worstScore = totalTestsAttempted > 0 ? worstScore : 0;

    // 5. Performance trend (last 5 tests percentage)
    const performanceTrend = allAttempts.slice(0, 5).map(attempt => ({
      date: attempt.submittedAt,
      testName: attempt.test?.title || "Unknown Test",
      percentage: (attempt.score / attempt.totalMarks) * 100,
      score: attempt.score,
      totalMarks: attempt.totalMarks
    }));

    // 6. Overall rank (optional)
    let userRank = null;
    if (totalTestsAttempted > 0) {
      const allUsersStats = await Attempt.aggregate([
        { $match: { status: "completed" } },
        {
          $group: {
            _id: "$user",
            totalScore: { $sum: "$score" },
            totalMarks: { $sum: "$totalMarks" }
          }
        },
        {
          $project: {
            averagePercentage: {
              $multiply: [
                { $divide: ["$totalScore", "$totalMarks"] },
                100
              ]
            }
          }
        },
        { $sort: { averagePercentage: -1 } }
      ]);

      const rankIndex = allUsersStats.findIndex(
        stat => stat._id.toString() === userId
      );
      userRank = rankIndex !== -1 ? rankIndex + 1 : null;
    }

    // 7. Bookmarked tests count
    const bookmarksCount = user.bookmarks?.length || 0;

    // 8. Response data
    const dashboardData = {
      personalDetails: {
        id: user._id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
        isVerified: user.isVerified,
        createdAt: user.createdAt,
        bookmarksCount: bookmarksCount
      },
      testStatistics: {
        totalTestsAttempted,
        averageScore: Math.round(testStats.averageScore * 100) / 100,
        bestScore: Math.round(testStats.bestScore * 100) / 100,
        worstScore: totalTestsAttempted > 0 ? Math.round(testStats.worstScore * 100) / 100 : 0,
        totalScoreObtained: testStats.totalScore,
        totalPossibleMarks: testStats.totalMarks,
        passCount: testStats.passCount,
        failCount: testStats.failCount,
        successRate: totalTestsAttempted > 0 
          ? Math.round((testStats.passCount / totalTestsAttempted) * 100) 
          : 0,
        subjectWiseStats: testStats.subjectWiseStats,
        userRank: userRank
      },
      recentActivity: {
        latestThreeTests: latestThreeAttempts.map(attempt => ({
          testId: attempt.test?._id,
          testName: attempt.test?.title || "Unknown Test",
          subject: attempt.test?.subject?.name || "N/A",
          topic: attempt.test?.topic?.name || "N/A",
          score: attempt.score,
          totalMarks: attempt.totalMarks,
          percentage: Math.round((attempt.score / attempt.totalMarks) * 100),
          submittedAt: attempt.submittedAt,
          duration: attempt.duration
        })),
        performanceTrend: performanceTrend
      },
      totalBookmarks: bookmarksCount
    };

    res.status(200).json({
      success: true,
      data: dashboardData
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user dashboard data",
      error: error.message
    });
  }
};

// Get simplified user profile (for editing)
const getUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    res.status(200).json({
      success: true,
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
        isVerified: user.isVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Update user profile
const updateUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, mobile } = req.body;

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { name, mobile },
      { new: true, runValidators: true }
    ).select("-password");

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: updatedUser
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get user's complete test history with pagination
const getUserTestHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const attempts = await Attempt.find({ user: userId, status: "completed" })
      .populate({
        path: "test",
        select: "title description duration totalMarks subject topic",
        populate: {
          path: "subject topic",
          select: "name"
        }
      })
      .sort({ submittedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalCount = await Attempt.countDocuments({ 
      user: userId, 
      status: "completed" 
    });

    const formattedAttempts = attempts.map(attempt => ({
      attemptId: attempt._id,
      testId: attempt.test?._id,
      testName: attempt.test?.title || "Unknown Test",
      subject: attempt.test?.subject?.name || "N/A",
      topic: attempt.test?.topic?.name || "N/A",
      score: attempt.score,
      totalMarks: attempt.totalMarks,
      percentage: Math.round((attempt.score / attempt.totalMarks) * 100),
      duration: attempt.duration,
      submittedAt: attempt.submittedAt,
      questionsAttempted: attempt.questions?.length || 0
    }));

    res.status(200).json({
      success: true,
      data: formattedAttempts,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / limit),
        totalCount,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get user statistics summary
const getUserStats = async (req, res) => {
  try {
    const userId = req.user.id;

    const [totalAttempts, bookmarksCount, user] = await Promise.all([
      Attempt.countDocuments({ user: userId, status: "completed" }),
      User.findById(userId).select("bookmarks"),
      User.findById(userId).select("name email")
    ]);

    const recentActivity = await Attempt.find({ user: userId, status: "completed" })
      .sort({ submittedAt: -1 })
      .limit(1)
      .select("submittedAt score totalMarks");

    const lastActive = recentActivity[0]?.submittedAt || user.createdAt;

    res.status(200).json({
      success: true,
      data: {
        totalTestsAttempted: totalAttempts,
        totalBookmarks: bookmarksCount?.bookmarks?.length || 0,
        lastActive: lastActive,
        memberSince: user.createdAt
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// change password, forgot password, reset password controllers can also be added here
// Change password

const changePassword = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { currentPassword, newPassword } = req.body;

    // ✅ Basic input validation
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Current password and new password are required"
      });
    }

    // ✅ Validate MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID"
      });
    }

    // ✅ Get user with password field
    const user = await User.findById(userId).select("+password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // ✅ Compare current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect"
      });
    }

    // ✅ Prevent same password reuse
    const isSamePassword = await user.comparePassword(newPassword);
    if (isSamePassword) {
      return res.status(400).json({
        success: false,
        message: "New password must be different from current password"
      });
    }

    // ✅ Strong password regex (production-ready)
    const passwordRegex =
      /^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&^()[\]{}\-_=+|;:'",.<>\/?\\]).{8,}$/;

    if (!passwordRegex.test(newPassword)) {
      return res.status(400).json({
        success: false,
        message:
          "Password must be at least 8 characters long and include letters, numbers, and a special character"
      });
    }

    // ✅ Update password (triggers pre-save hook for hashing)
    user.password = newPassword;
    await user.save();

    // ✅ Optional: remove password from response object
    user.password = undefined;

    return res.status(200).json({
      success: true,
      message: "Password changed successfully"
    });
  } catch (error) {
    console.error("Change Password Error:", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong"
    });
  }
};

// get remaining time for an in-progress attempt (optional, can be used for auto-saving or warning user about time)
const getRemainingTime = async (req, res) => {
  try {
    const { attemptId } = req.params;
    const attempt = await Attempt.findOne({
      _id: attemptId,
      user: req.user.id
    });

    if (!attempt) {
      return res.status(404).json({ msg: "Attempt not found" });
    }

    // ✅ SYNC TIME
    syncRemainingTime(attempt);
    await attempt.save();

    res.json({
      remainingTime: attempt.remainingTime,
      status: attempt.status
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

module.exports = { 
  getAvailableTests, 
  startTest, 
  pauseTest, 
  resumeTest, 
  getAttemptQuestions, 
  saveAnswer, 
  submitTest, 
  getDetailedResult, 
  getLeaderboard, 
  getPublishedTests,
  getTestById,
  getMyResults,
  getUserDashboard,
  getUserProfile,
  updateUserProfile,
  getUserTestHistory,
  getUserStats,
  changePassword,
  getRemainingTime
};