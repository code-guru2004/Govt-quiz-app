const User = require("../models/User");


// Add test to bookmarks
const addBookmark = async (req, res) => {
    try {
      const { testId } = req.params;
      const userId = req.user.id; // Assuming auth middleware sets req.user
  
      const user = await User.findById(userId);
      
      if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
      }
  
      // Check if already bookmarked
      if (user.bookmarks.includes(testId)) {
        return res.status(400).json({ success: false, message: "Test already bookmarked" });
      }
  
      user.bookmarks.push(testId);
      await user.save();
  
      res.status(200).json({
        success: true,
        message: "Test added to bookmarks",
        bookmarks: user.bookmarks
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  };
  
  // Remove test from bookmarks
  const removeBookmark = async (req, res) => {
    try {
      const { testId } = req.params;
      const userId = req.user.id;
  
      const user = await User.findById(userId);
      
      if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
      }
  
      user.bookmarks = user.bookmarks.filter(
        id => id.toString() !== testId
      );
      await user.save();
  
      res.status(200).json({
        success: true,
        message: "Test removed from bookmarks",
        bookmarks: user.bookmarks
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  };
  
  // Get all bookmarked tests with details
  const getBookmarks = async (req, res) => {
    try {
      const userId = req.user.id;
  
      const user = await User.findById(userId).populate({
        path: "bookmarks",
        select: "title description duration totalMarks subject topic difficulty", // Adjust based on your Test schema
        populate: {
          path: "subject topic",
          select: "name"
        }
      });
  
      if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
      }
  
      res.status(200).json({
        success: true,
        count: user.bookmarks.length,
        data: user.bookmarks
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  };
  
  // Check if test is bookmarked
  const isBookmarked = async (req, res) => {
    try {
      const { testId } = req.params;
      const userId = req.user.id;
  
      const user = await User.findById(userId).select("bookmarks");
      
      if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
      }
  
      const isBookmarked = user.bookmarks.includes(testId);
  
      res.status(200).json({
        success: true,
        isBookmarked
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  };
  
  module.exports = {
    addBookmark,
    removeBookmark,
    getBookmarks,
    isBookmarked
  };