const Question = require("../models/Question"); 
const Attempt = require("../models/Attempt");

const getAttemptResult = async (req, res) => {
  try {
    const { attemptId } = req.params;
    const userId = req.user.id;

    const attempt = await Attempt.findById(attemptId)
      .populate("test", "title totalMarks totalQuestions duration");

    if (!attempt) {
      return res.status(404).json({ message: "Attempt not found" });
    }

    if (attempt.user.toString() !== userId) {
      return res.status(403).json({ message: "Unauthorized access" });
    }

    // =========================
    // 🧠 COMMON SUMMARY
    // =========================
    const summary = {
      score: attempt.score,
      totalMarks: attempt.totalMarks,
      totalQuestions: attempt.totalQuestions,
      correct: attempt.correctAnswers,
      wrong: attempt.wrongAnswers,
      skipped: attempt.unattempted,
      accuracy:
        attempt.correctAnswers + attempt.wrongAnswers === 0
          ? 0
          : Number(
              (
                (attempt.correctAnswers /
                  (attempt.correctAnswers + attempt.wrongAnswers)) *
                100
              ).toFixed(2)
            ),
      attemptedAt: attempt.createdAt
    };

    // =========================
    // 📱 DEVICE & IP INFORMATION
    // =========================
    const deviceInfo = {
      ipAddress: attempt.ipAddress || null,
      userAgent: attempt.userAgent || null,
      deviceDetails: {
        browser: attempt.deviceInfo?.browser || null,
        browserVersion: attempt.deviceInfo?.browserVersion || null,
        os: attempt.deviceInfo?.os || null,
        osVersion: attempt.deviceInfo?.osVersion || null,
        deviceType: attempt.deviceInfo?.deviceType || null,
        brand: attempt.deviceInfo?.brand || null,
        model: attempt.deviceInfo?.model || null
      }
    };

    // =========================
    // ⏱️ TIME INFORMATION
    // =========================
    const timeInfo = {
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      lastResumedAt: attempt.lastResumedAt,
      timeTakenMinutes: attempt.timeTakenMinutes,
      duration: attempt.duration || null,
      remainingTime: attempt.remainingTime || null
    };

    // =========================
    // ✅ FLAT TEST
    // =========================
    if (!attempt.hasSections) {
      const questionIds = attempt.questions.map(q => q.questionId);

      const questions = await Question.find({
        _id: { $in: questionIds }
      }).select("+correctAnswer");

      const questionMap = {};
      questions.forEach(q => {
        questionMap[q._id.toString()] = q;
      });

      const answers = attempt.questions.map(ans => {
        const q = questionMap[ans.questionId.toString()];

        return {
          questionId: q?._id,
          questionText: q?.questionText,
          options: q?.options,
          correctOption: q?.correctAnswer,

          selectedOption: ans.selectedOption,
          isCorrect: ans.isCorrect,
          marksObtained: ans.marksObtained || 0,
          timeSpent: ans.timeSpent || 0,

          status: !ans.selectedOption
            ? "unattempted"
            : ans.isCorrect
            ? "correct"
            : "wrong",

          fact: q?.fact || null
        };
      });

      return res.json({
        attemptId: attempt._id,
        test: attempt.test,
        summary,
        answers,
        deviceInfo,      // 🔥 Add device info
        timeInfo,        // 🔥 Add time info
        status: attempt.status,
        hasSections: false
      });
    }

    // =========================
    // ✅ SECTIONAL TEST
    // =========================
    else {
      let sections = [];

      for (const section of attempt.sections) {
        const questionIds = section.questions.map(q => q.questionId);

        const questions = await Question.find({
          _id: { $in: questionIds }
        }).select("+correctAnswer");

        const questionMap = {};
        questions.forEach(q => {
          questionMap[q._id.toString()] = q;
        });

        const answers = section.questions.map(ans => {
          const q = questionMap[ans.questionId.toString()];

          return {
            questionId: q?._id,
            questionText: q?.questionText,
            options: q?.options,
            correctOption: q?.correctAnswer,

            selectedOption: ans.selectedOption,
            isCorrect: ans.isCorrect,
            marksObtained: ans.marksObtained || 0,
            timeSpent: ans.timeSpent || 0,

            status: !ans.selectedOption
              ? "unattempted"
              : ans.isCorrect
              ? "correct"
              : "wrong",

            fact: q?.fact || null
          };
        });

        sections.push({
          sectionIndex: section.sectionIndex,
          sectionTitle: section.sectionTitle,
          totalQuestions: section.questions.length,
          answers
        });
      }

      // Add section-wise time info
      const sectionTimeInfo = attempt.sectionRemainingTime?.map(section => ({
        sectionIndex: section.sectionIndex,
        remainingTime: section.remainingTime,
        lastUpdatedAt: section.lastUpdatedAt
      })) || [];

      return res.json({
        attemptId: attempt._id,
        test: attempt.test,
        summary,
        sections,
        deviceInfo,           // 🔥 Add device info
        timeInfo,             // 🔥 Add time info
        sectionTimeInfo,      // 🔥 Add section time info
        status: attempt.status,
        hasSections: true,
        currentSectionIndex: attempt.currentSectionIndex,
        sectionLocked: attempt.sectionLocked,
        completedSections: attempt.completedSections
      });
    }

  } catch (error) {
    console.error("Get Attempt Result Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  getAttemptResult
};