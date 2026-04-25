const Test = require("../models/Test");
const Attempt = require("../models/Attempt");
const Question = require("../models/Question");
const User = require("../models/User");
const mongoose = require("mongoose");

// utility function:
// const syncRemainingTime = (attempt) => {
//   if (attempt.status !== "in-progress") return;

//   const now = new Date();

//   // =========================
//   // ✅ FLAT TEST
//   // =========================
//   if (!attempt.hasSections) {
//     if (!attempt.lastResumedAt || attempt.remainingTime == null) return;

//     const timeSpent = Math.floor((now - attempt.lastResumedAt) / 1000);

//     if (timeSpent > 0) {
//       attempt.remainingTime = Math.max(
//         0,
//         attempt.remainingTime - timeSpent
//       );

//       attempt.lastResumedAt = now;
//     }

//     // 🏁 AUTO COMPLETE
//     if (attempt.remainingTime === 0) {
//       attempt.status = "completed";
//       attempt.submittedAt = now;
//     }
//   }

//   // =========================
//   // ✅ SECTION TEST (STRICT)
//   // =========================
//   else {
//     const currentIndex = attempt.currentSectionIndex;

//     const sectionTimer = attempt.sectionRemainingTime.find(
//       (s) => s.sectionIndex === currentIndex
//     );

//     const sectionData = attempt.sections.find(
//       (s) => s.sectionIndex === currentIndex
//     );

//     if (!sectionTimer || !sectionData) return;

//     const last = sectionTimer.lastUpdatedAt || attempt.lastResumedAt;
//     if (!last) return;

//     const timeSpent = Math.floor((now - last) / 1000);

//     if (timeSpent > 0) {
//       sectionTimer.remainingTime = Math.max(
//         0,
//         sectionTimer.remainingTime - timeSpent
//       );

//       // 🔥 ONLY update section timer (NOT both)
//       sectionTimer.lastUpdatedAt = now;
//     }

//     // =========================
//     // 🔒 LOCK + MOVE
//     // =========================
//     if (sectionTimer.remainingTime === 0 && !sectionData.sectionLocked) {
//       sectionData.sectionLocked = true;
//       sectionData.completedAt = now;

//       const nextSection = attempt.sections.find(
//         (s) =>
//           s.sectionIndex > currentIndex &&
//           !s.sectionLocked
//       );

//       if (nextSection) {
//         attempt.currentSectionIndex = nextSection.sectionIndex;
//         attempt.currentQuestionIndex = 0;

//         const nextTimer = attempt.sectionRemainingTime.find(
//           (s) => s.sectionIndex === nextSection.sectionIndex
//         );

//         if (nextTimer) {
//           nextTimer.lastUpdatedAt = now;
//         }
//       } else {
//         // 🏁 COMPLETE TEST
//         attempt.status = "completed";
//         attempt.submittedAt = now;
//       }
//     }
//   }
// };

// Add this helper function to calculate results
const calculateAttemptResults = (attempt) => {
  let totalScore = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let unattempted = 0;
  let sectionResults = [];

  if (!attempt.hasSections) {
    // Flat test calculation
    attempt.questions.forEach(q => {
      if (!q.selectedOption) {
        unattempted++;
      } else if (q.isCorrect) {
        correctCount++;
      } else {
        wrongCount++;
      }
      totalScore += q.marksObtained || 0;
    });
  } else {
    // Sectional test calculation
    attempt.sections.forEach(section => {
      let sectionScore = 0;
      let sectionCorrect = 0;
      let sectionWrong = 0;
      let sectionUnattempted = 0;

      section.questions.forEach(q => {
        if (!q.selectedOption) {
          sectionUnattempted++;
        } else if (q.isCorrect) {
          sectionCorrect++;
        } else {
          sectionWrong++;
        }
        sectionScore += q.marksObtained || 0;
      });

      totalScore += sectionScore;
      correctCount += sectionCorrect;
      wrongCount += sectionWrong;
      unattempted += sectionUnattempted;

      sectionResults.push({
        sectionIndex: section.sectionIndex,
        sectionTitle: section.sectionTitle,
        score: sectionScore,
        correct: sectionCorrect,
        wrong: sectionWrong,
        unattempted: sectionUnattempted,
        totalQuestions: section.questions.length
      });
    });
  }

  // Update attempt with results
  attempt.score = totalScore;
  attempt.correctAnswers = correctCount;
  attempt.wrongAnswers = wrongCount;
  attempt.unattempted = unattempted;
  
  return { totalScore, correctCount, wrongCount, unattempted, sectionResults };
};

// Updated syncRemainingTime function
const syncRemainingTime = (attempt) => {
  if (attempt.status !== "in-progress") return;

  const now = new Date();

  // =========================
  // ✅ FLAT TEST
  // =========================
  if (!attempt.hasSections) {
    if (!attempt.lastResumedAt || attempt.remainingTime == null) return;

    const timeSpent = Math.floor((now - attempt.lastResumedAt) / 1000);

    if (timeSpent > 0) {
      attempt.remainingTime = Math.max(
        0,
        attempt.remainingTime - timeSpent
      );

      attempt.lastResumedAt = now;
    }

    // 🏁 AUTO COMPLETE - NOW WITH RESULTS CALCULATION
    if (attempt.remainingTime === 0) {
      attempt.status = "completed";
      attempt.submittedAt = now;
      // 🔥 Calculate results when time expires
      calculateAttemptResults(attempt);
    }
  }

  // =========================
  // ✅ SECTION TEST (STRICT)
  // =========================
  else {
    const currentIndex = attempt.currentSectionIndex;

    const sectionTimer = attempt.sectionRemainingTime.find(
      (s) => s.sectionIndex === currentIndex
    );

    const sectionData = attempt.sections.find(
      (s) => s.sectionIndex === currentIndex
    );

    if (!sectionTimer || !sectionData) return;

    const last = sectionTimer.lastUpdatedAt || attempt.lastResumedAt;
    if (!last) return;

    const timeSpent = Math.floor((now - last) / 1000);

    if (timeSpent > 0) {
      sectionTimer.remainingTime = Math.max(
        0,
        sectionTimer.remainingTime - timeSpent
      );

      // 🔥 ONLY update section timer (NOT both)
      sectionTimer.lastUpdatedAt = now;
    }

    // =========================
    // 🔒 LOCK + MOVE
    // =========================
    if (sectionTimer.remainingTime === 0 && !sectionData.sectionLocked) {
      sectionData.sectionLocked = true;
      sectionData.completedAt = now;

      const nextSection = attempt.sections.find(
        (s) =>
          s.sectionIndex > currentIndex &&
          !s.sectionLocked
      );

      if (nextSection) {
        attempt.currentSectionIndex = nextSection.sectionIndex;
        attempt.currentQuestionIndex = 0;

        const nextTimer = attempt.sectionRemainingTime.find(
          (s) => s.sectionIndex === nextSection.sectionIndex
        );

        if (nextTimer) {
          nextTimer.lastUpdatedAt = now;
        }
      } else {
        // 🏁 COMPLETE TEST - NOW WITH RESULTS CALCULATION
        attempt.status = "completed";
        attempt.submittedAt = now;
        // 🔥 Calculate results when all sections are completed
        calculateAttemptResults(attempt);
      }
    }
  }
};
 
/**
 * =================================================================================
 * Main controllers
 * =========================================================
 */
const startTest = async (req, res) => {
  try {
    const { testId } = req.params;
    const userId = req.user.id;
    const now = new Date();

    const test = await Test.findById(testId)
      .populate("questions", "_id marks")  // Include marks field
      .populate("sections.questions", "_id marks")  // Include marks for section questions
      .lean();

    if (!test) {
      return res.status(404).json({ msg: "Test not found" });
    }

    if (!test.isPublished) {
      return res.status(400).json({ msg: "Test not published yet" });
    }

    if (!test.hasSections && (!test.duration || test.duration <= 0)) {
      return res.status(400).json({ msg: "Invalid test duration" });
    }

    if (test.scheduleType === "one-time") {
      if (now < test.startTime) {
        return res.status(400).json({ msg: "Test not started" });
      }
      if (now > test.endTime) {
        return res.status(400).json({ msg: "Test ended" });
      }
    }

    // =========================
    // 🔁 EXISTING ATTEMPT
    // =========================
    const existingAttempt = await Attempt.findOne({
      user: userId,
      test: testId,
      status: { $in: ["in-progress", "paused"] }
    });

    if (existingAttempt) {
      syncRemainingTime(existingAttempt);
      await existingAttempt.save();

      return res.status(400).json({
        msg: "Attempt already in progress",
        attemptId: existingAttempt._id,
        resume: true,
        status: existingAttempt.status,
        hasSections: existingAttempt.hasSections,
        remainingTime: existingAttempt.hasSections
          ? existingAttempt.sectionRemainingTime
          : existingAttempt.remainingTime,
        currentSectionIndex: existingAttempt.currentSectionIndex,
        currentQuestionIndex: existingAttempt.currentQuestionIndex
      });
    }

    // =========================
    // 🚫 ATTEMPT LIMIT
    // =========================
    const completedAttempts = await Attempt.countDocuments({
      user: userId,
      test: testId,
      status: "completed"
    });

    if (test.maxAttempts !== -1 && completedAttempts >= test.maxAttempts) {
      return res.status(400).json({
        msg: "Maximum attempts reached"
      });
    }

    let totalQuestions = 0;
    let totalMarks = 0;  // Initialize total marks
    let questions = [];
    let sections = [];
    let sectionRemainingTime = [];

    // =========================
    // ✅ FLAT TEST
    // =========================
    if (!test.hasSections) {
      // Calculate total marks from questions
      for (const q of test.questions) {
        const questionMarks = q.marks || 1; // Default to 1 if marks not set
        totalMarks += questionMarks;
      }
      
      questions = test.questions.map((q) => ({
        questionId: q._id
      }));

      totalQuestions = questions.length;
    }

    // =========================
    // ✅ SECTION TEST
    // =========================
    else {
      sections = test.sections.map((sec, index) => {
        const secDuration = sec.duration;
        
        if (!secDuration || secDuration <= 0) {
          throw new Error(`Invalid duration in section ${sec.title}`);
        }
        
        // Calculate section total marks
        let sectionTotalMarks = 0;
        for (const q of sec.questions) {
          const questionMarks = q.marks || 1; // Default to 1 if marks not set
          sectionTotalMarks += questionMarks;
        }
        
        sectionRemainingTime.push({
          sectionIndex: index,
          remainingTime: secDuration * 60,
          lastUpdatedAt: now
        });
        
        totalQuestions += sec.questions.length;
        totalMarks += sectionTotalMarks;
        
        return {
          sectionIndex: index,
          sectionTitle: sec.title,
          sectionDuration: secDuration,
          totalMarks: sectionTotalMarks,  // Store section total marks
          sectionLocked: false,
          questions: sec.questions.map((q) => ({
            questionId: q._id
          }))
        };
      });
    }

    const attemptData = {
      user: userId,
      test: testId,
      hasSections: test.hasSections,
      questions: test.hasSections ? [] : questions,
      sections: test.hasSections ? sections : [],
      sectionRemainingTime: test.hasSections ? sectionRemainingTime : [],
      totalQuestions,
      totalMarks,  // Use calculated total marks
      negativeMarks: test.negativeMarks || 0,
      status: "in-progress",
      startedAt: now,
      lastResumedAt: now,
      currentQuestionIndex: 0,
      currentSectionIndex: 0
    };

    if (!test.hasSections) {
      attemptData.duration = test.duration;
      attemptData.remainingTime = test.duration * 60;
    }

    const attempt = await Attempt.create(attemptData);

    return res.status(201).json({
      msg: "Test started",
      attemptId: attempt._id,
      hasSections: attempt.hasSections,
      totalMarks: attempt.totalMarks,  // Include in response for verification
      remainingTime: attempt.hasSections
        ? attempt.sectionRemainingTime
        : attempt.remainingTime
    });

  } catch (err) {
    console.error("Error in startTest:", err);
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
      return res.status(400).json({ msg: "Test not running" });
    }

    syncRemainingTime(attempt);

    if (
      (!attempt.hasSections && attempt.remainingTime === 0) ||
      (attempt.hasSections && attempt.status === "completed")
    ) {
      attempt.status = "completed";
      attempt.submittedAt = new Date();
      // 🔥 Calculate results when time expires during pause
      calculateAttemptResults(attempt);
      await attempt.save();

      return res.status(400).json({ msg: "Time over" });
    }

    attempt.status = "paused";
    attempt.lastResumedAt = null;

    await attempt.save();

    res.json({ msg: "Paused" });

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
      return res.status(400).json({ msg: "Not paused" });
    }

    // 🔥 DO NOT sync here (important)

    attempt.status = "in-progress";
    attempt.lastResumedAt = new Date();

    if (attempt.hasSections) {
      const currentTimer = attempt.sectionRemainingTime.find(
        (s) => s.sectionIndex === attempt.currentSectionIndex
      );

      if (currentTimer) {
        currentTimer.lastUpdatedAt = new Date();
      }
    }

    await attempt.save();

    res.json({
      msg: "Resumed",
      attemptId: attempt._id
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
    }).populate("user", "name email _id");
    
    
    if (!attempt) {
      return res.status(404).json({ msg: "Attempt not found" });
    }

    // =========================
    // ⏱ SYNC TIMER
    // =========================
    syncRemainingTime(attempt);

    // =========================
    // 🏁 HANDLE COMPLETION
    // =========================
    if (attempt.status === "completed") {
      await attempt.save();

      return res.status(200).json({
        success: true,
        msg: "Test completed",
        status: "completed",
        user: attempt.user, // Include user info
        attempt: {
          id: attempt._id,
          score: attempt.score,
          totalMarks: attempt.totalMarks,
          percentage: attempt.percentage,
          submittedAt: attempt.submittedAt
        }
      });
    }

    await attempt.save();

    // =========================
    // ✅ FLAT TEST
    // =========================
    if (!attempt.hasSections) {
      if (attempt.remainingTime <= 0) {
        attempt.status = "completed";
        attempt.submittedAt = new Date();
         // 🔥 Calculate results when time expires
        calculateAttemptResults(attempt);
        await attempt.save();

        return res.status(400).json({ 
          success: false,
          msg: "Time is over",
          user: attempt.user
        });
      }

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
        isMarkedForReview: q.isMarkedForReview,
        timeSpent: q.timeSpent || 0
      }));

      return res.json({
        success: true,
        user: {
          id: attempt.user._id,
          name: attempt.user.name,
          email: attempt.user.email
        },
        attempt: {
          id: attempt._id,
          status: attempt.status,
          hasSections: false,
          currentQuestionIndex: attempt.currentQuestionIndex,
          remainingTime: attempt.remainingTime,
          totalQuestions: attempt.totalQuestions,
          startedAt: attempt.startedAt,
          lastResumedAt: attempt.lastResumedAt
        },
        questions: orderedQuestions
      });
    }

    // =========================
    // ✅ SECTIONAL TEST
    // =========================
    else {
      const currentSectionIndex = attempt.currentSectionIndex;

      const currentSection = attempt.sections.find(
        s => s.sectionIndex === currentSectionIndex
      );

      if (!currentSection) {
        return res.status(400).json({ 
          success: false,
          msg: "Invalid section state",
          user: attempt.user
        });
      }

      const sectionTimer = attempt.sectionRemainingTime.find(
        s => s.sectionIndex === currentSectionIndex
      );

// In the sectional test section of getAttemptQuestions:

// ⛔ Section time over (extra safety)
if (!sectionTimer || sectionTimer.remainingTime <= 0) {
  // Lock the current section
  if (currentSection && !currentSection.sectionLocked) {
    currentSection.sectionLocked = true;
    currentSection.completedAt = new Date();
    
    // Check if there's a next section
    const nextSection = attempt.sections.find(
      (s) => s.sectionIndex > currentSectionIndex && !s.sectionLocked
    );
    
    if (!nextSection) {
      // No more sections - complete the test
      attempt.status = "completed";
      attempt.submittedAt = new Date();
      calculateAttemptResults(attempt);
      await attempt.save();
      
      return res.status(400).json({
        success: false,
        msg: "Test completed - all sections time over",
        user: attempt.user
      });
    } else {
      // Move to next section
      attempt.currentSectionIndex = nextSection.sectionIndex;
      attempt.currentQuestionIndex = 0;
      
      // Update next section timer
      const nextTimer = attempt.sectionRemainingTime.find(
        (s) => s.sectionIndex === nextSection.sectionIndex
      );
      if (nextTimer) {
        nextTimer.lastUpdatedAt = new Date();
      }
      
      await attempt.save();
      
      return res.status(400).json({
        success: false,
        msg: "Section time is over, moving to next section",
        user: attempt.user
      });
    }
  }
}

      const questionIds = currentSection.questions.map(q => q.questionId);

      const questions = await Question.find({
        _id: { $in: questionIds }
      }).select("-correctAnswer");

      const questionMap = {};
      questions.forEach(q => {
        questionMap[q._id] = q;
      });

      const orderedQuestions = currentSection.questions.map(q => ({
        ...questionMap[q.questionId]?.toObject(),
        selectedOption: q.selectedOption,
        isMarkedForReview: q.isMarkedForReview,
        timeSpent: q.timeSpent || 0
      }));

      // ✅ SECTION SUMMARY (for sidebar UI)
      const sectionSummary = attempt.sections.map(sec => {
        const timer = attempt.sectionRemainingTime.find(
          s => s.sectionIndex === sec.sectionIndex
        );

        return {
          sectionIndex: sec.sectionIndex,
          sectionTitle: sec.sectionTitle,
          totalQuestions: sec.questions.length,
          sectionLocked: sec.sectionLocked,
          remainingTime: timer ? timer.remainingTime : 0
        };
      });

      return res.json({
        success: true,
        user: {
          id: attempt.user._id,
          name: attempt.user.name,
          email: attempt.user.email
        },
        attempt: {
          id: attempt._id,
          status: attempt.status,
          hasSections: true,
          currentSectionIndex,
          currentQuestionIndex: attempt.currentQuestionIndex,
          remainingTime: sectionTimer.remainingTime,
          totalQuestions: currentSection.questions.length,
          startedAt: attempt.startedAt,
          completedSections: attempt.completedSections
        },
        sections: sectionSummary,
        questions: orderedQuestions
      });
    }

  } catch (err) {
    console.error("Get attempt questions error:", err);
    res.status(500).json({ 
      success: false,
      msg: err.message 
    });
  }
};

const saveAnswer = async (req, res) => {
  try {
    const { attemptId } = req.params;

    const {
      questionId,
      selectedOption,
      timeSpent,
      isMarkedForReview,
      currentQuestionIndex,
      sectionIndex // 🔥 REQUIRED for sectional tests
    } = req.body;

    const attempt = await Attempt.findOne({
      _id: attemptId,
      user: req.user.id
    })
      .populate("questions.questionId", "options correctAnswer marks")
      .populate("sections.questions.questionId", "options correctAnswer marks");

    if (!attempt) {
      return res.status(404).json({ msg: "Attempt not found" });
    }

    // =========================
    // ⏱ SYNC TIMER FIRST
    // =========================
    syncRemainingTime(attempt);

    // =========================
    // 🏁 HANDLE AUTO COMPLETION
    // =========================
    if (attempt.status === "completed") {
      await attempt.save();
      return res.status(400).json({
        msg: "Test already submitted"
      });
    }

    // =========================
    // ✅ FLAT TEST LOGIC
    // =========================
    if (!attempt.hasSections) {
      if (attempt.remainingTime <= 0) {
        attempt.status = "completed";
        attempt.submittedAt = new Date();
        await attempt.save();

        return res.status(400).json({ msg: "Time is over" });
      }

      const question = attempt.questions.find(
        (q) => q.questionId._id.toString() === questionId
      );

      if (!question) {
        return res.status(400).json({ msg: "Invalid question" });
      }

      // ✅ Validate & save option
      if (selectedOption !== undefined) {
        const isValid = question.questionId.options.some(
          (opt) => opt.id === selectedOption
        );

        if (!isValid) {
          return res.status(400).json({ msg: "Invalid option" });
        }

        question.selectedOption = selectedOption;
        const correctAnswer = question.questionId.correctAnswer;
        const marks = question.questionId.marks || 0;
        const negativeMarks = attempt.negativeMarks || 0;

        // ✅ CHECK CORRECTNESS
        question.isCorrect = correctAnswer === selectedOption;

        // ✅ CALCULATE MARKS
        if (question.isCorrect) {
          question.marksObtained = marks;
        } else {
          question.marksObtained = -negativeMarks;
        }
      }

      if (isMarkedForReview !== undefined) {
        question.isMarkedForReview = isMarkedForReview;
      }

      if (timeSpent) {
        question.timeSpent = (question.timeSpent || 0) + timeSpent;
      }

      if (currentQuestionIndex !== undefined) {
        attempt.currentQuestionIndex = currentQuestionIndex;
      }
    }

    // =========================
    // ✅ SECTIONAL TEST LOGIC
    // =========================
    else {
      // 🔒 NO SECTION SWITCHING
      if (sectionIndex !== attempt.currentSectionIndex) {
        return res.status(403).json({
          msg: "Section switching not allowed"
        });
      }

      const currentSection = attempt.sections.find(
        (s) => s.sectionIndex === sectionIndex
      );

      if (!currentSection) {
        return res.status(400).json({ msg: "Invalid section" });
      }

      // 🔒 SECTION LOCK CHECK
      if (currentSection.sectionLocked) {
        return res.status(400).json({
          msg: "Section is locked"
        });
      }

      const sectionTimer = attempt.sectionRemainingTime.find(
        (s) => s.sectionIndex === sectionIndex
      );

      if (!sectionTimer || sectionTimer.remainingTime <= 0) {
        return res.status(400).json({
          msg: "Section time is over"
        });
      }

      const question = currentSection.questions.find(
        (q) => q.questionId._id.toString() === questionId
      );

      if (!question) {
        return res.status(400).json({ msg: "Invalid question" });
      }

      // ✅ Validate & save option
      if (selectedOption !== undefined) {
        const isValid = question.questionId.options.some(
          (opt) => opt.id === selectedOption
        );

        if (!isValid) {
          return res.status(400).json({ msg: "Invalid option" });
        }

        question.selectedOption = selectedOption;
        const correctAnswer = question.questionId.correctAnswer;
        const marks = question.questionId.marks || 0;
        const negativeMarks = attempt.negativeMarks || 0;

        // ✅ CHECK CORRECTNESS
        question.isCorrect = correctAnswer === selectedOption;

        // ✅ CALCULATE MARKS
        if (question.isCorrect) {
          question.marksObtained = marks;
        } else {
          question.marksObtained = -negativeMarks;
        }

      }

      if (isMarkedForReview !== undefined) {
        question.isMarkedForReview = isMarkedForReview;
      }

      if (timeSpent) {
        question.timeSpent = (question.timeSpent || 0) + timeSpent;
      }

      if (currentQuestionIndex !== undefined) {
        attempt.currentQuestionIndex = currentQuestionIndex;
      }
    }

    // =========================
    // 💾 SAVE ATTEMPT
    // =========================
    await attempt.save();

    res.json({
      msg: "Answer saved successfully",
      currentSectionIndex: attempt.currentSectionIndex,
      currentQuestionIndex: attempt.currentQuestionIndex,
      status: attempt.status
    });

  } catch (err) {
    console.error("Save answer error:", err);
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

    // =========================
    // ⏱ FINAL SYNC
    // =========================
    syncRemainingTime(attempt);

    // =========================
    // 🧠 INIT RESULT
    // =========================
    let totalScore = 0;
    let correctCount = 0;
    let wrongCount = 0;
    let unattempted = 0;

    let sectionResults = [];

    // =========================
    // ✅ FLAT TEST
    // =========================
    if (!attempt.hasSections) {
      attempt.questions.forEach(q => {
        if (!q.selectedOption) {
          unattempted++;
        } else if (q.isCorrect) {
          correctCount++;
        } else {
          wrongCount++;
        }

        totalScore += q.marksObtained || 0;
      });
    }

    // =========================
    // ✅ SECTIONAL TEST
    // =========================
    else {
      attempt.sections.forEach(section => {
        let sectionScore = 0;
        let sectionCorrect = 0;
        let sectionWrong = 0;
        let sectionUnattempted = 0;

        section.questions.forEach(q => {
          if (!q.selectedOption) {
            sectionUnattempted++;
          } else if (q.isCorrect) {
            sectionCorrect++;
          } else {
            sectionWrong++;
          }

          sectionScore += q.marksObtained || 0;
        });

        // accumulate global
        totalScore += sectionScore;
        correctCount += sectionCorrect;
        wrongCount += sectionWrong;
        unattempted += sectionUnattempted;

        // store section result
        sectionResults.push({
          sectionIndex: section.sectionIndex,
          sectionTitle: section.sectionTitle,
          score: sectionScore,
          correct: sectionCorrect,
          wrong: sectionWrong,
          unattempted: sectionUnattempted,
          totalQuestions: section.questions.length
        });
      });
    }

    // =========================
    // 🏁 FINALIZE ATTEMPT
    // =========================
    attempt.score = totalScore;
    attempt.correctAnswers = correctCount;
    attempt.wrongAnswers = wrongCount;
    attempt.unattempted = unattempted;

    attempt.status = "completed";
    attempt.submittedAt = new Date();

    await attempt.save();

    // =========================
    // 📤 RESPONSE
    // =========================
    return res.json({
      msg: "Test submitted successfully",
      result: {
        score: totalScore,
        totalMarks: attempt.totalMarks,
        correct: correctCount,
        wrong: wrongCount,
        unattempted,
        ...(attempt.hasSections && { sections: sectionResults })
      }
    });

  } catch (err) {
    console.error("Submit test error:", err);
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
          marksObtained: q.marksObtained || 0,
          timeSpent: q.timeSpent || 0,

          status: !q.selectedOption
            ? "unattempted"
            : q.isCorrect
            ? "correct"
            : "wrong"
        };
      });

      return res.json({
        score: attempt.score,
        totalMarks: attempt.totalMarks,
        correct: attempt.correctAnswers,
        wrong: attempt.wrongAnswers,
        unattempted: attempt.unattempted,
        hasSections: attempt.hasSections,
        questions: detailed
      });
    }

    // =========================
    // ✅ SECTIONAL TEST
    // =========================
    else {
      let sectionResults = [];

      for (const section of attempt.sections) {
        const questionIds = section.questions.map(q => q.questionId);

        const questions = await Question.find({
          _id: { $in: questionIds }
        }).select("+correctAnswer");

        const questionMap = {};
        questions.forEach(q => {
          questionMap[q._id] = q;
        });

        const detailedQuestions = section.questions.map(q => {
          const actual = questionMap[q.questionId];

          return {
            questionId: q.questionId,
            questionText: actual.questionText,
            options: actual.options,

            selectedOption: q.selectedOption,
            correctAnswer: actual.correctAnswer,

            isCorrect: q.isCorrect,
            marksObtained: q.marksObtained || 0,
            timeSpent: q.timeSpent || 0,

            status: !q.selectedOption
              ? "unattempted"
              : q.isCorrect
              ? "correct"
              : "wrong"
          };
        });

        sectionResults.push({
          sectionIndex: section.sectionIndex,
          sectionTitle: section.sectionTitle,
          totalQuestions: section.questions.length,
          questions: detailedQuestions
        });
      }

      return res.json({
        score: attempt.score,
        totalMarks: attempt.totalMarks,
        correct: attempt.correctAnswers,
        wrong: attempt.wrongAnswers,
        unattempted: attempt.unattempted,
        hasSections: attempt.hasSections,
        sections: sectionResults
      });
    }

  } catch (err) {
    console.error("Detailed result error:", err);
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

      // ✅ BEST attempt per user
      {
        $sort: { score: -1, submittedAt: 1 }
      },

      {
        $group: {
          _id: "$user",
          attempt: { $first: "$$ROOT" }
        }
      },

      {
        $replaceRoot: { newRoot: "$attempt" }
      },

      // ✅ Final ranking sort
      {
        $sort: { score: -1, submittedAt: 1 }
      },

      {
        $limit: 50
      },

      // ✅ Join user
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "user"
        }
      },
      { $unwind: "$user" },

      // ✅ Projection
      {
        $project: {
          score: 1,
          correctAnswers: 1,
          wrongAnswers: 1,
          submittedAt: 1,
          totalQuestions: 1,
          "user.name": 1,
          "user.email": 1
        }
      }
    ]);

    // ✅ Add rank + accuracy
    const result = leaderboard.map((a, index) => {
      const attempted = a.correctAnswers + a.wrongAnswers;
      const accuracy = attempted
        ? (a.correctAnswers / attempted) * 100
        : 0;

      return {
        rank: index + 1,
        name: a.user.name,
        email: a.user.email,
        score: a.score,
        correct: a.correctAnswers,
        wrong: a.wrongAnswers,
        accuracy: Number(accuracy.toFixed(2)),
        submittedAt: a.submittedAt
      };
    });

    res.json({ leaderboard: result });

  } catch (err) {
    console.error("Leaderboard error:", err);
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

      // ✅ Sort properly for grouping
      { $sort: { test: 1, submittedAt: -1 } },

      // ✅ Join Test
      {
        $lookup: {
          from: "tests",
          localField: "test",
          foreignField: "_id",
          as: "testData"
        }
      },
      { $unwind: "$testData" },

      // ✅ Group by test
      {
        $group: {
          _id: "$test",

          title: { $first: "$testData.title" },

          latestAttempt: { $first: "$submittedAt" },

          bestScore: { $max: "$score" },

          totalAttempts: { $sum: 1 },

          attempts: {
            $push: {
              attemptId: "$_id",
              score: "$score",
              totalMarks: "$totalMarks",
              correct: "$correctAnswers",
              wrong: "$wrongAnswers",
              submittedAt: "$submittedAt"
            }
          }
        }
      },

      { $sort: { latestAttempt: -1 } },

      // ✅ Pagination
      {
        $facet: {
          metadata: [{ $count: "total" }],
          data: [{ $skip: skip }, { $limit: limit }]
        }
      }
    ]);

    const total = results[0].metadata[0]?.total || 0;

    // ✅ Final formatting
    const formatted = results[0].data.map(item => {
      const attempts = item.attempts.map(a => {
        const attempted = a.correct + a.wrong;
        const accuracy = attempted
          ? (a.correct / attempted) * 100
          : 0;

        return {
          ...a,
          accuracy: Number(accuracy.toFixed(2))
        };
      });

      return {
        testId: item._id,
        title: item.title,
        bestScore: item.bestScore,
        totalAttempts: item.totalAttempts,
        attempts
      };
    });

    res.json({
      success: true,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      data: formatted
    });

  } catch (error) {
    console.error("Get results error:", error);
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
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const attempts = await Attempt.find({
      user: userId,
      status: "completed"
    })
    .populate({
      path: "test",
      select: "title description duration totalMarks subject topic subjects testType",
      populate: [
        { path: "subject", select: "name" },
        { path: "topic", select: "name" },
        { path: "subjects", select: "name" } // 🔥 ADD THIS
      ]
    })
      .sort({ submittedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalCount = await Attempt.countDocuments({
      user: userId,
      status: "completed"
    });

    const formattedAttempts = attempts.map(attempt => {
      const test = attempt.test || {};
    
      const totalMarks = attempt.totalMarks || 0;
    
      const percentage =
        totalMarks === 0
          ? 0
          : Math.round((attempt.score / totalMarks) * 100);
    
      const questionsAttempted =
        (attempt.correctAnswers || 0) +
        (attempt.wrongAnswers || 0);
    
      // 🎯 HANDLE SUBJECT(S) PROPERLY
      let subjectData = null;
    
      if (test.testType === "full") {
        subjectData = test.subjects?.map(s => s.name) || [];
      } else {
        subjectData = test.subject?.name || "N/A";
      }
    
      return {
        attemptId: attempt._id,
        testId: test._id || null,
    
        testName: test.title || "Deleted Test",
        testType: test.testType,
    
        subject: subjectData,   // 🔥 NOW FLEXIBLE
        topic: test.topic?.name || null,
    
        score: attempt.score,
        totalMarks,
        percentage,
    
        correct: attempt.correctAnswers || 0,
        wrong: attempt.wrongAnswers || 0,
        skipped: attempt.unattempted || 0,
        questionsAttempted,
    
        duration: attempt.duration,
        submittedAt: attempt.submittedAt
      };
    });

    res.status(200).json({
      success: true,
      data: formattedAttempts,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalCount,
        limit
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


// get tests based on filter
const buildFilter = ({ type, subjectId, topicId }) => {
  const now = new Date();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const filter = {
    isTemplate: false,
    isPublished: true // ✅ ONLY PUBLISHED TESTS
  };

  // 🔥 NON-SCHEDULED TESTS
  if (["topic", "subject", "full-length", "sectional"].includes(type)) {
    filter.scheduleType = "one-time";
    filter.startTime = { $lte: now };
    filter.endTime = { $gte: now };

    if (type === "topic") {
      filter.testType = "topic";
      if (subjectId) filter.subject = subjectId;
      if (topicId) filter.topic = topicId;
    }

    if (type === "subject") {
      filter.testType = "subject";
      if (subjectId) filter.subject = subjectId;
    }

    if (type === "full-length") {
      filter.testType = "full";
    }

    if (type === "sectional") {
      filter.hasSections = true;
    }
  }

  // 🔥 SCHEDULED TESTS
  if (type === "scheduled") {
    filter.scheduleType = { $in: ["daily", "weekly", "monthly"] };
    filter.validForDate = today;
  }

  return filter;
};

const getAvailableTests = async (req, res) => {
  try {
    const filter = buildFilter(req.query);

    const tests = await Test.find(filter)
      .select("title testType subject topic subjects startTime endTime")
      .populate("subject", "name")
      .populate("topic", "name")
      .lean();

    return res.status(200).json({
      success: true,
      count: tests.length,
      data: tests
    });

  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
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