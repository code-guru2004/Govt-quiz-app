// userController.js
const User = require("../models/User");
const Attempt = require("../models/Attempt");

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

module.exports = {
  getUserDashboard,
  getUserProfile,
  updateUserProfile,
  getUserTestHistory,
  getUserStats
};