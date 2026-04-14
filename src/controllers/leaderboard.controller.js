// leaderboardController.js
const Attempt = require("../models/Attempt");
const User = require("../models/User");

/**
 * Get leaderboard based on:
 * - Number of unique tests attempted
 * - Average score across all attempts
 */
const getLeaderboard = async (req, res) => {
    try {
      const { limit = 50, page = 1 } = req.query;
      const skip = (page - 1) * limit;
  
      // Aggregation pipeline
      const leaderboard = await Attempt.aggregate([
        // Step 1: Only consider completed tests
        { $match: { status: "completed" } },
        
        // Step 2: Group by user to calculate stats
        {
          $group: {
            _id: "$user",
            uniqueTestsAttempted: { $addToSet: "$test" }, // Unique tests
            totalScore: { $sum: "$score" },
            totalMarks: { $sum: "$totalMarks" },
            attemptCount: { $sum: 1 }
          }
        },
        
        // Step 3: Calculate metrics
        {
          $project: {
            userId: "$_id",
            uniqueTestsCount: { $size: "$uniqueTestsAttempted" },
            averageScorePercentage: {
              $multiply: [
                { $divide: ["$totalScore", "$totalMarks"] },
                100
              ]
            },
            totalAttempts: "$attemptCount"
          }
        },
        
        // Step 4: Sort by unique tests (desc) and then by avg score (desc)
        { $sort: { uniqueTestsCount: -1, averageScorePercentage: -1 } },
        
        // Step 5: Pagination
        { $skip: skip },
        { $limit: parseInt(limit) },
        
        // Step 6: Lookup user details
        {
          $lookup: {
            from: "users",
            localField: "userId",
            foreignField: "_id",
            as: "userDetails"
          }
        },
        
        // Step 7: Unwind user details
        { $unwind: "$userDetails" },
        
        // Step 8: Final projection
        {
          $project: {
            _id: 0,
            rank: "$$CURRENT", // Will be calculated later
            user: {
              id: "$userDetails._id",
              name: "$userDetails.name",
              email: "$userDetails.email",
              mobile: "$userDetails.mobile"
            },
            uniqueTestsCount: 1,
            averageScorePercentage: { $round: ["$averageScorePercentage", 2] },
            totalAttempts: 1
          }
        }
      ]);
  
      // Add rank numbers
      const leaderboardWithRank = leaderboard.map((entry, index) => ({
        ...entry,
        rank: skip + index + 1
      }));
  
      // Get total count for pagination
      const totalUsers = await Attempt.aggregate([
        { $match: { status: "completed" } },
        { $group: { _id: "$user" } },
        { $count: "total" }
      ]);
  
      res.status(200).json({
        success: true,
        data: leaderboardWithRank,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil((totalUsers[0]?.total || 0) / limit),
          totalUsers: totalUsers[0]?.total || 0,
          limit: parseInt(limit)
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  };
  
  /**
   * Get leaderboard with weighted scoring (custom formula)
   * Weight = (Unique Tests * 0.6) + (Avg Score % * 0.4)
   */
  const getWeightedLeaderboard = async (req, res) => {
    try {
      const { limit = 50 } = req.query;
  
      const leaderboard = await Attempt.aggregate([
        { $match: { status: "completed" } },
        
        {
          $group: {
            _id: "$user",
            uniqueTests: { $addToSet: "$test" },
            totalScore: { $sum: "$score" },
            totalMarks: { $sum: "$totalMarks" }
          }
        },
        
        {
          $project: {
            userId: "$_id",
            uniqueTestsCount: { $size: "$uniqueTests" },
            avgScorePercent: {
              $multiply: [
                { $divide: ["$totalScore", "$totalMarks"] },
                100
              ]
            }
          }
        },
        
        // Calculate weighted score (customize weights as needed)
        {
          $addFields: {
            weightedScore: {
              $add: [
                { $multiply: ["$uniqueTestsCount", 0.6] },  // 60% weight to test count
                { $multiply: ["$avgScorePercent", 0.4] }    // 40% weight to avg score
              ]
            }
          }
        },
        
        { $sort: { weightedScore: -1 } },
        { $limit: parseInt(limit) },
        
        {
          $lookup: {
            from: "users",
            localField: "userId",
            foreignField: "_id",
            as: "userDetails"
          }
        },
        
        { $unwind: "$userDetails" },
        
        {
          $project: {
            _id: 0,
            rank: "$$CURRENT",
            user: {
              id: "$userDetails._id",
              name: "$userDetails.name",
              email: "$userDetails.email"
            },
            uniqueTestsCount: 1,
            averageScorePercentage: { $round: ["$avgScorePercent", 2] },
            weightedScore: { $round: ["$weightedScore", 2] }
          }
        }
      ]);
  
      const leaderboardWithRank = leaderboard.map((entry, index) => ({
        ...entry,
        rank: index + 1
      }));
  
      res.status(200).json({
        success: true,
        data: leaderboardWithRank
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  };
  
  /**
   * Get individual user's rank and stats
   */
  const getUserRank = async (req, res) => {
    try {
      const { userId } = req.params;
  
      // Get all users stats first
      const allUsersStats = await Attempt.aggregate([
        { $match: { status: "completed" } },
        {
          $group: {
            _id: "$user",
            uniqueTests: { $addToSet: "$test" },
            totalScore: { $sum: "$score" },
            totalMarks: { $sum: "$totalMarks" }
          }
        },
        {
          $project: {
            uniqueTestsCount: { $size: "$uniqueTests" },
            avgScorePercent: {
              $multiply: [
                { $divide: ["$totalScore", "$totalMarks"] },
                100
              ]
            }
          }
        },
        { $sort: { uniqueTestsCount: -1, avgScorePercent: -1 } }
      ]);
  
      // Find user's rank
      const userRank = allUsersStats.findIndex(
        stat => stat._id.toString() === userId
      ) + 1;
  
      // Get user's stats
      const userStats = allUsersStats.find(
        stat => stat._id.toString() === userId
      );
  
      if (!userStats) {
        return res.status(404).json({
          success: false,
          message: "User not found or no completed tests"
        });
      }
  
      // Get user details
      const user = await User.findById(userId).select("name email mobile");
  
      res.status(200).json({
        success: true,
        data: {
          rank: userRank,
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
            mobile: user.mobile
          },
          uniqueTestsCount: userStats.uniqueTestsCount,
          averageScorePercentage: Math.round(userStats.avgScorePercent * 100) / 100,
          totalUsersRanked: allUsersStats.length
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  };
  
  module.exports = {
    getLeaderboard,
    getWeightedLeaderboard,
    getUserRank
  };