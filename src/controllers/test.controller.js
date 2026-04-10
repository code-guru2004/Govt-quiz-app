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
        message: "Subject ID and Topic ID are required"
      });
    }

    // ✅ 1. Get tests
    const tests = await Test.find({
      subject: subjectId,
      topic: topicId,
      isPublished: true
    })
      .populate("subject")
      .populate("topic");

    if (!tests.length) {
      return res.status(404).json({
        tests: [],
        message: "No tests found"
      });
    }

    // ✅ 2. Get all user attempts for these tests
    const testIds = tests.map(t => t._id);

    const attempts = await Attempt.find({
      user: userId,
      test: { $in: testIds }
    });

    // ✅ 3. Map attempts
    const attemptMap = {};

    attempts.forEach(attempt => {
      if (!attemptMap[attempt.test]) {
        attemptMap[attempt.test] = [];
      }
      attemptMap[attempt.test].push(attempt);
    });

    // ✅ 4. Merge data
    const finalTests = tests.map(test => {
      const userAttempts = attemptMap[test._id] || [];

      const attemptCount = userAttempts.length;

      const inProgressAttempt = userAttempts.find(
        a => a.status === "in-progress" || a.status === "paused"
      );

      const userTestStatus = inProgressAttempt
        ? "in-progress"
        : attemptCount > 0
        ? "completed"
        : "not-attempted";

      const remainingAttempts =
        test.maxAttempts === -1
          ? Infinity
          : test.maxAttempts - attemptCount;


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

        // 🔥 IMPORTANT FIELDS FOR UI
        attemptCount,
        remainingAttempts,
        userTestStatus,
        attemptId: inProgressAttempt?._id || null
      };
    });

    res.json({
      tests: finalTests,
      message: "Tests fetched successfully"
    });

  } catch (error) {
    console.error("Error fetching tests:", error);
    res.status(500).json({
      tests: [],
      message: "Server error"
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
        message: "Subject ID is required"
      });
    }

    // ✅ 1. Get tests
    const tests = await Test.find({
      subject: subjectId,
      topic: null, // only tests without topic
      isPublished: true
    })
      .populate("subject")
      .populate("topic");

    if (!tests.length) {
      return res.status(404).json({
        tests: [],
        message: "No tests found"
      });
    }

    // ✅ 2. Get all user attempts for these tests
    const testIds = tests.map(t => t._id);

    const attempts = await Attempt.find({
      user: userId,
      test: { $in: testIds }
    });
    // ✅ 3. Map attempts
    const attemptMap = {};

    attempts.forEach(attempt => {
      if (!attemptMap[attempt.test]) {
        attemptMap[attempt.test] = [];
      }
      attemptMap[attempt.test].push(attempt);
    });

    // ✅ 4. Merge data 
    const finalTests = tests.map(test => {
      const userAttempts = attemptMap[test._id] || [];  

      const attemptCount = userAttempts.length;

      const inProgressAttempt = userAttempts.find(
        a => a.status === "in-progress" || a.status === "paused"
      );
      const userTestStatus = inProgressAttempt
        ? "in-progress"
        : attemptCount > 0
        ? "completed"
        : "not-attempted";
      const remainingAttempts =
        test.maxAttempts === -1
          ? Infinity
          : test.maxAttempts - attemptCount;
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
        // 🔥 IMPORTANT FIELDS FOR UI
        attemptCount,
        remainingAttempts,
        userTestStatus,
        attemptId: inProgressAttempt?._id || null
      };
    });

    res.json({
      tests: finalTests,
      message: "Tests fetched successfully"
    });

  } catch (error) {
    console.error("Error fetching tests:", error);
    res.status(500).json({
      tests: [],
      message: "Server error"
    });
  }
};
module.exports = {
  getTestsByTopicAndSubject,
  getTestsBySubject
};