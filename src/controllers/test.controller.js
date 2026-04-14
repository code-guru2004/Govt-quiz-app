// get all tests for a topic and subject
const Test = require("../models/Test");

const Attempt = require("../models/Attempt");

const getTestsByTopicAndSubject = async (req, res) => {
  try {
    const { subjectId, topicId } = req.params;
    const userId = req.user.id;

    if (!subjectId || !topicId) {
      return res.status(400).json({
        tests: [],
        message: "Subject ID and Topic ID are required",
      });
    }

    // 1. Fetch tests
    const tests = await Test.find({
      subject: subjectId,
      topic: topicId,
      isPublished: true,
    })
      .populate("subject", "name")
      .populate("topic", "name");

    if (!tests.length) {
      return res.status(404).json({
        tests: [],
        message: "No tests found",
      });
    }

    const testIds = tests.map((t) => t._id);

    // 2. Fetch attempts
    const attempts = await Attempt.find({
      user: userId,
      test: { $in: testIds },
    }).sort({ createdAt: 1 }); // oldest first

    // 3. Group attempts
    const attemptMap = {};

    for (const attempt of attempts) {
      const key = attempt.test.toString();
      if (!attemptMap[key]) attemptMap[key] = [];
      attemptMap[key].push(attempt);
    }

    // 4. Build response
    const finalTests = tests.map((test) => {
      const testId = test._id.toString();
      const userAttempts = attemptMap[testId] || [];

      const activeAttempt = userAttempts.find(
        (a) => a.status === "in-progress" || a.status === "paused"
      );

      const completedAttempts = userAttempts.filter(
        (a) => a.status === "completed"
      );

      const oldestCompleted = completedAttempts[0] || null;

      const attemptCount = userAttempts.length;

      const remainingAttempts =
        test.maxAttempts === -1
          ? Infinity
          : Math.max(test.maxAttempts - attemptCount, 0);

      return {
        _id: test._id,
        title: test.title,
        description: test.description,

        subject: test.subject.name,
        topic: test.topic.name,

        totalQuestions: test.questions.length,
        duration: test.duration,
        totalMarks: test.totalMarks,

        startTime: test.startTime,
        endTime: test.endTime,

        maxAttempts: test.maxAttempts,

        attemptCount,
        remainingAttempts,

        // 🔥 CAPABILITY FLAGS (BEST PRACTICE)
        canResume: !!activeAttempt,
        canViewResult: completedAttempts.length > 0,
        canStart:
          !activeAttempt &&
          (test.maxAttempts === -1 || remainingAttempts > 0),

        // 🔥 IMPORTANT IDS
        activeAttemptId: activeAttempt?._id || null,
        oldestCompletedAttemptId: oldestCompleted?._id || null,
        completedAttemptsCount: completedAttempts.length
      };
    });

    return res.json({
      tests: finalTests,
      message: "Tests fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching tests:", error);
    return res.status(500).json({
      tests: [],
      message: "Server error",
    });
  }
};

// TODO: get tests by subject (without topic filter) for dashboard
const getTestsBySubject = async (req, res) => {
  try {
    const { subjectId } = req.params;
    const userId = req.user.id;

    if (!subjectId) {
      return res.status(400).json({
        tests: [],
        message: "Subject ID is required",
      });
    }

    // ✅ 1. Fetch tests (subject-level only)
    const tests = await Test.find({
      subject: subjectId,
      topic: null, // subject-wise tests only
      isPublished: true,
    }).populate("subject", "name");

    if (!tests.length) {
      return res.status(404).json({
        tests: [],
        message: "No tests found",
      });
    }

    const testIds = tests.map((t) => t._id);

    // ✅ 2. Fetch attempts
    const attempts = await Attempt.find({
      user: userId,
      test: { $in: testIds },
    }).sort({ createdAt: 1 }); // oldest → newest

    // ✅ 3. Group attempts
    const attemptMap = {};

    for (const attempt of attempts) {
      const key = attempt.test.toString();
      if (!attemptMap[key]) attemptMap[key] = [];
      attemptMap[key].push(attempt);
    }

    // ✅ 4. Build response (NEW LOGIC)
    const finalTests = tests.map((test) => {
      const testId = test._id.toString();
      const userAttempts = attemptMap[testId] || [];

      const activeAttempt = userAttempts.find(
        (a) => a.status === "in-progress" || a.status === "paused"
      );

      const completedAttempts = userAttempts.filter(
        (a) => a.status === "completed"
      );

      const attemptCount = userAttempts.length;
      const completedAttemptsCount = completedAttempts.length;

      const remainingAttempts =
        test.maxAttempts === -1
          ? Infinity
          : Math.max(test.maxAttempts - attemptCount, 0);

      return {
        _id: test._id,
        title: test.title,
        description: test.description,
        subject: test.subject.name,

        totalQuestions: test.questions.length,
        duration: test.duration,
        totalMarks: test.totalMarks,

        startTime: test.startTime,
        endTime: test.endTime,
        maxAttempts: test.maxAttempts,

        // 🔥 CORE FIELDS
        attemptCount,
        completedAttemptsCount,
        remainingAttempts,

        // 🔥 CAPABILITIES (UI CONTROL)
        canResume: !!activeAttempt,
        canViewResult: completedAttemptsCount > 0,
        canStart:
          !activeAttempt &&
          (test.maxAttempts === -1 || remainingAttempts > 0),

        // 🔥 NAVIGATION
        activeAttemptId: activeAttempt?._id || null,
      };
    });

    return res.json({
      tests: finalTests,
      message: "Tests fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching tests:", error);
    return res.status(500).json({
      tests: [],
      message: "Server error",
    });
  }
};


// get all attempts of a test for an user
const getAttemptsByTest = async (req, res) => {
  try {
    const { testId } = req.params;
    const userId = req.user.id;
    console.log(testId);

    const attempts = await Attempt.find({
      user: userId,
      test: testId,
      status: "completed"
    })
      .sort({ createdAt: -1 }) // latest first
      .select("score createdAt submittedAt duration totalMarks");

    return res.json({
      testId,
      count: attempts.length,
      attempts
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};



module.exports = {
  getTestsByTopicAndSubject,
  getTestsBySubject,
  getAttemptsByTest
};