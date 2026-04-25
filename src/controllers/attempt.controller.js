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
        answers
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

      return res.json({
        attemptId: attempt._id,
        test: attempt.test,
        summary,
        sections
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