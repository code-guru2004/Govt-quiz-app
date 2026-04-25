const User = require("../models/User");
const Attempt = require("../models/Attempt");

// Get all users with test attempt statistics
const getAllUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";
    const role = req.query.role || "all";
    const skip = (page - 1) * limit;

    // Build filter
    let filter = {};
    
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { mobile: { $regex: search, $options: "i" } }
      ];
    }
    
    if (role !== "all") {
      filter.role = role;
    }

    // Get users with pagination
    const users = await User.find(filter)
      
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalUsers = await User.countDocuments(filter);

    // Get attempt statistics for all users
    const userIds = users.map(user => user._id);
    
    // Aggregation pipeline for user statistics
    const userStats = await Attempt.aggregate([
      {
        $match: {
          user: { $in: userIds },
          status: "completed"
        }
      },
      {
        $group: {
          _id: "$user",
          totalTests: { $sum: 1 },
          totalScore: { $sum: "$score" },
          totalMarks: { $sum: "$totalMarks" },
          tests: {
            $push: {
              testId: "$test",
              score: "$score",
              totalMarks: "$totalMarks",
              percentage: { $multiply: [{ $divide: ["$score", "$totalMarks"] }, 100] },
              completedAt: "$submittedAt"
            }
          }
        }
      },
      {
        $project: {
          totalTests: 1,
          avgScore: { $cond: [{ $eq: ["$totalTests", 0] }, 0, { $divide: ["$totalScore", "$totalTests"] }] },
          avgPercentage: { $cond: [{ $eq: ["$totalTests", 0] }, 0, { $multiply: [{ $divide: ["$totalScore", "$totalMarks"] }, 100] }] },
          tests: 1
        }
      }
    ]);

    // Create a map for quick lookup
    const statsMap = new Map();
    userStats.forEach(stat => {
      statsMap.set(stat._id.toString(), stat);
    });

    // Combine user data with statistics
    const usersWithStats = users.map(user => {
      const stats = statsMap.get(user._id.toString()) || {
        totalTests: 0,
        avgScore: 0,
        avgPercentage: 0,
        tests: []
      };
      //console.log(usersWithStats)
      return {
        _id: user._id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
        isVerified: user.isVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        statistics: {
          totalTestsAttempted: stats.totalTests,
          averageScore: Math.round(stats.avgScore * 100) / 100,
          averagePercentage: Math.round(stats.avgPercentage * 100) / 100,
          tests: stats.tests
        }
      };
    });

    res.status(200).json({
      success: true,
      data: {
        users: usersWithStats,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalUsers / limit),
          totalUsers,
          limit,
          hasNext: page < Math.ceil(totalUsers / limit),
          hasPrev: page > 1
        }
      }
    });

  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch users",
      error: error.message
    });
  }
};

// Get single user details with detailed test history
const getUserDetails = async (req, res) => {
  try {
    const { userId } = req.params;

    // Get user details
    const user = await User.findById(userId)
     

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Get all attempts with test details
    const attempts = await Attempt.aggregate([
      {
        $match: {
          user: user._id,
          status: "completed"
        }
      },
      {
        $lookup: {
          from: "tests",
          localField: "test",
          foreignField: "_id",
          as: "testDetails"
        }
      },
      {
        $unwind: {
          path: "$testDetails",
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $project: {
          testId: "$test",
          testTitle: "$testDetails.title",
          testDescription: "$testDetails.description",
          score: 1,
          totalMarks: 1,
          percentage: { $multiply: [{ $divide: ["$score", "$totalMarks"] }, 100] },
          correctAnswers: 1,
          wrongAnswers: 1,
          unattempted: 1,
          duration: 1,
          timeTakenMinutes: { $divide: [{ $subtract: ["$submittedAt", "$startedAt"] }, 60000] },
          startedAt: 1,
          submittedAt: 1,
          status: 1
        }
      },
      {
        $sort: { submittedAt: -1 }
      }
    ]);

    // Calculate overall statistics
    const overallStats = {
      totalTests: attempts.length,
      totalScore: 0,
      totalMarks: 0,
      totalCorrect: 0,
      totalWrong: 0,
      totalUnattempted: 0
    };

    attempts.forEach(attempt => {
      overallStats.totalScore += attempt.score;
      overallStats.totalMarks += attempt.totalMarks;
      overallStats.totalCorrect += attempt.correctAnswers || 0;
      overallStats.totalWrong += attempt.wrongAnswers || 0;
      overallStats.totalUnattempted += attempt.unattempted || 0;
    });

    overallStats.averagePercentage = overallStats.totalMarks > 0 
      ? (overallStats.totalScore / overallStats.totalMarks) * 100 
      : 0;

    res.status(200).json({
      success: true,
      data: {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          mobile: user.mobile,
          role: user.role,
          isVerified: user.isVerified,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        },
        statistics: overallStats,
        attemptHistory: attempts
      }
    });

  } catch (error) {
    console.error("Error fetching user details:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user details",
      error: error.message
    });
  }
};

// Update user role
const updateUserRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!["admin", "user"].includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid role. Must be 'admin' or 'user'"
      });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { role },
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    res.status(200).json({
      success: true,
      message: "User role updated successfully",
      data: user
    });

  } catch (error) {
    console.error("Error updating user role:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update user role",
      error: error.message
    });
  }
};

// Delete user (admin only)
const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;

    // Don't allow deleting yourself
    if (userId === req.user.id) {
      return res.status(400).json({
        success: false,
        message: "You cannot delete your own account"
      });
    }

    const user = await User.findByIdAndDelete(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Also delete all attempts of this user
    await Attempt.deleteMany({ user: userId });

    res.status(200).json({
      success: true,
      message: "User deleted successfully"
    });

  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete user",
      error: error.message
    });
  }
};

// Get user statistics for dashboard
const getUserStatistics = async (req, res) => {
  try {
    // Get total users count
    const totalUsers = await User.countDocuments();
    const verifiedUsers = await User.countDocuments({ isVerified: true });
    const unverifiedUsers = await User.countDocuments({ isVerified: false });
    
    // Get users by role
    const adminCount = await User.countDocuments({ role: "admin" });
    const userCount = await User.countDocuments({ role: "user" });
    
    // Get user registration trends (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const registrationTrend = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 }
      }
    ]);
    
    // Get top performing users
    const topUsers = await Attempt.aggregate([
      {
        $match: {
          status: "completed"
        }
      },
      {
        $group: {
          _id: "$user",
          totalTests: { $sum: 1 },
          avgScore: { $avg: "$score" },
          avgPercentage: { $avg: { $multiply: [{ $divide: ["$score", "$totalMarks"] }, 100] } }
        }
      },
      {
        $sort: { avgPercentage: -1 }
      },
      {
        $limit: 10
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "userDetails"
        }
      },
      {
        $unwind: "$userDetails"
      },
      {
        $project: {
          name: "$userDetails.name",
          email: "$userDetails.email",
          totalTests: 1,
          avgScore: 1,
          avgPercentage: { $round: ["$avgPercentage", 2] }
        }
      }
    ]);
    
    res.status(200).json({
      success: true,
      data: {
        overview: {
          totalUsers,
          verifiedUsers,
          unverifiedUsers,
          adminCount,
          userCount
        },
        registrationTrend,
        topUsers
      }
    });
    
  } catch (error) {
    console.error("Error fetching user statistics:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user statistics",
      error: error.message
    });
  }
};

module.exports = {
  getAllUsers,
  getUserDetails,
  updateUserRole,
  deleteUser,
  getUserStatistics
};