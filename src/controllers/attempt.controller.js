const Question = require("../models/Question"); 
const Attempt = require("../models/Attempt");

const getAttemptResult = async (req, res) => {
  try {
    const { attemptId } = req.params;
    const userId = req.user.id;

    // 1. Fetch attempt
    const attempt = await Attempt.findById(attemptId)
      .populate("test", "title totalMarks totalQuestions duration");

    if (!attempt) {
      return res.status(404).json({ message: "Attempt not found" });
    }

    // 2. Security check
    if (attempt.user.toString() !== userId) {
      return res.status(403).json({ message: "Unauthorized access" });
    }

    // ✅ FIXED HERE
    const questionIds = attempt.questions.map(q => q.questionId);

    // 4. Fetch questions
    const questions = await Question.find({
      _id: { $in: questionIds }
    }).select("+correctAnswer");;

    // 5. Map questions
    const questionMap = {};
    questions.forEach(q => {
      questionMap[q._id.toString()] = q;
    });

    // 6. Build result
    let correctCount = 0;
    let wrongCount = 0;
    let skippedCount = 0;

    const detailedAnswers = attempt.questions.map(ans => {
      const q = questionMap[ans.questionId.toString()];

      if (!ans.selectedOption) {
        skippedCount++;
      } else if (ans.isCorrect) {
        correctCount++;
      } else {
        wrongCount++;
      }

      return {
        questionId: q?._id,
        questionText: q?.questionText,
        options: q?.options,
        correctOption: q?.correctAnswer,
        selectedOption: ans.selectedOption,
        isCorrect: ans.isCorrect,
        explanation: q?.explanation || null
      };
    });

    // 7. Accuracy
    const totalAnswered = correctCount + wrongCount;
    const accuracy =
      totalAnswered === 0
        ? 0
        : ((correctCount / totalAnswered) * 100).toFixed(2);

    // 8. Response
    return res.json({
      attemptId: attempt._id,
      test: attempt.test,

      summary: {
        score: attempt.score,
        totalQuestions: attempt.totalQuestions,
        correct: correctCount,
        wrong: wrongCount,
        skipped: skippedCount,
        accuracy: Number(accuracy),
        attemptedAt: attempt.createdAt
      },

      answers: detailedAnswers
    });

  } catch (error) {
    console.error("Get Attempt Result Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  getAttemptResult
};