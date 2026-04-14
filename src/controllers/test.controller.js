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
      return res.status(200).json({
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



// Get paginated list of full-length tests with filters and user attempt status
const getFullLengthTests = async (req, res) => {
  try {
    const userId = req.user?.id;
    
    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Filtering parameters
    const { 
      subject, 
      topic, 
      difficulty,
      search,
      sortBy = "createdAt",
      sortOrder = "desc",
      isFeatured,
      status // "upcoming", "ongoing", "completed"
    } = req.query;
    
    const currentDate = new Date();
    
    // Build query
    const query = { 
      testType: "full",
      isPublished: true  // Use isPublished instead of isActive
    };
    
    // Add filters
    if (subject && mongoose.Types.ObjectId.isValid(subject)) {
      // For full tests, subjects are stored in 'subjects' array
      query.subjects = { $in: [subject] };
    }
    
    if (topic && mongoose.Types.ObjectId.isValid(topic)) {
      query.topic = topic;
    }
    
    if (difficulty) query.difficulty = difficulty;
    
    if (isFeatured === "true") query.isFeatured = true;
    
    // Date-based filtering
    if (status === "upcoming") {
      query.startTime = { $gt: currentDate };
    } else if (status === "ongoing") {
      query.startTime = { $lte: currentDate };
      query.endTime = { $gte: currentDate };
    } else if (status === "completed") {
      query.endTime = { $lt: currentDate };
    }
    
    // Search by title or description
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } }
      ];
    }
    
    // Build sort object
    const sort = {};
    if (sortBy === "startTime") {
      sort.startTime = sortOrder === "desc" ? -1 : 1;
    } else if (sortBy === "endTime") {
      sort.endTime = sortOrder === "desc" ? -1 : 1;
    } else if (sortBy === "totalMarks") {
      sort.totalMarks = sortOrder === "desc" ? -1 : 1;
    } else if (sortBy === "duration") {
      sort.duration = sortOrder === "desc" ? -1 : 1;
    } else {
      sort[sortBy] = sortOrder === "desc" ? -1 : 1;
    }
    
    // First, get all test IDs that match the query (for user attempts lookup)
    const testIds = await Test.find(query).distinct("_id");
    
    // Execute queries in parallel
    const [tests, totalCount, userAttempts] = await Promise.all([
      // Fetch tests with populated fields
      Test.find(query)
        .populate("subject", "name ")
        .populate("topic", "name")
        .populate("subjects", "name")
        .populate("createdBy", "name email")
        .select("-questions") // Exclude questions for performance
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      
      // Get total count for pagination
      Test.countDocuments(query),
      
      // Get user's attempts for these tests
      userId && testIds.length > 0 ? Attempt.find({
        user: userId,
        test: { $in: testIds }
      }).select("test score totalMarks status submittedAt startedAt remainingTime currentQuestionIndex")
        .sort({ submittedAt: -1 })
        .lean() : Promise.resolve([])
    ]);
    
    // Create a map of user attempts (group by test)
    const attemptsMap = new Map();
    userAttempts.forEach(attempt => {
      const testId = attempt.test.toString();
      if (!attemptsMap.has(testId)) {
        attemptsMap.set(testId, []);
      }
      attemptsMap.get(testId).push({
        attemptId: attempt._id,
        score: attempt.score,
        totalMarks: attempt.totalMarks,
        percentage: attempt.totalMarks > 0 ? (attempt.score / attempt.totalMarks) * 100 : 0,
        status: attempt.status,
        submittedAt: attempt.submittedAt,
        startedAt: attempt.startedAt,
        remainingTime: attempt.remainingTime,
        currentQuestionIndex: attempt.currentQuestionIndex
      });
    });
    
    // Get question counts for tests efficiently
    const testIdsForCount = tests.map(t => t._id);
    let questionCounts = new Map();
    
    if (testIdsForCount.length > 0) {
      const counts = await Test.aggregate([
        { $match: { _id: { $in: testIdsForCount } } },
        { $project: { 
            _id: 1, 
            questionCount: { $size: "$questions" } 
          } 
        }
      ]);
      
      counts.forEach(count => {
        questionCounts.set(count._id.toString(), count.questionCount);
      });
    }
    
    // Enhance tests with attempt status and metadata
    const enhancedTests = tests.map(test => {
      const testObj = { ...test };
      const attempts = attemptsMap.get(test._id.toString()) || [];
      const completedAttempts = attempts.filter(a => a.status === "completed");
      const inProgressAttempt = attempts.find(a => a.status === "in-progress" || a.status === "paused");
      
      // Determine test status
      const now = new Date();
      let testStatus = "upcoming";
      if (now >= test.startTime && now <= test.endTime) {
        testStatus = "ongoing";
      } else if (now > test.endTime) {
        testStatus = "ended";
      }
      
      // Add attempt information
      testObj.hasAttempted = completedAttempts.length > 0;
      testObj.hasInProgress = !!inProgressAttempt;
      testObj.totalAttempts = attempts.length;
      testObj.remainingAttempts = Math.max(0, (test.maxAttempts || 1) - attempts.length);
      
      if (completedAttempts.length > 0) {
        const bestAttempt = completedAttempts.reduce((best, current) => 
          (current.percentage > best.percentage) ? current : best, completedAttempts[0]);
        
        testObj.bestAttempt = {
          score: bestAttempt.score,
          totalMarks: bestAttempt.totalMarks,
          percentage: Math.round(bestAttempt.percentage * 100) / 100,
          submittedAt: bestAttempt.submittedAt
        };
        
        testObj.lastAttempt = {
          score: completedAttempts[0].score,
          totalMarks: completedAttempts[0].totalMarks,
          percentage: Math.round(completedAttempts[0].percentage * 100) / 100,
          submittedAt: completedAttempts[0].submittedAt
        };
      }
      
      if (inProgressAttempt) {
        testObj.inProgressAttempt = {
          attemptId: inProgressAttempt.attemptId,
          startedAt: inProgressAttempt.startedAt,
          remainingTime: inProgressAttempt.remainingTime,
          currentQuestionIndex: inProgressAttempt.currentQuestionIndex
        };
      }
      
      // Add metadata for UI
      testObj.totalQuestions = questionCounts.get(test._id.toString()) || 0;
      testObj.testStatus = testStatus;
      testObj.isAvailable = testStatus === "ongoing" && testObj.remainingAttempts > 0;
      testObj.startTimeFormatted = test.startTime;
      testObj.endTimeFormatted = test.endTime;
      
      return testObj;
    });
    
    // Calculate statistics for filters
    let statistics = null;
    if (page === 1) {
      const now = new Date();
      const [totalTests, upcomingTests, ongoingTests, completedTests, attemptedTests] = await Promise.all([
        Test.countDocuments({ testType: "full", isPublished: true }),
        Test.countDocuments({ testType: "full", isPublished: true, startTime: { $gt: now } }),
        Test.countDocuments({ 
          testType: "full", 
          isPublished: true, 
          startTime: { $lte: now }, 
          endTime: { $gte: now } 
        }),
        Test.countDocuments({ testType: "full", isPublished: true, endTime: { $lt: now } }),
        userId ? Attempt.countDocuments({ 
          user: userId, 
          status: "completed",
          test: { $in: await Test.find({ testType: "full", isPublished: true }).distinct("_id") }
        }) : Promise.resolve(0)
      ]);
      
      // Get subject distribution
      const subjectDistribution = await Test.aggregate([
        { $match: { testType: "full", isPublished: true } },
        { $unwind: "$subjects" },
        { $group: { _id: "$subjects", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: "subjects",
            localField: "_id",
            foreignField: "_id",
            as: "subjectInfo"
          }
        },
        { $unwind: { path: "$subjectInfo", preserveNullAndEmptyArrays: true } },
        { $project: { subjectName: "$subjectInfo.name", count: 1 } }
      ]);
      
      statistics = {
        totalTests,
        upcomingTests,
        ongoingTests,
        completedTests,
        attemptedByUser: attemptedTests,
        completionRate: totalTests > 0 ? (attemptedTests / totalTests) * 100 : 0,
        topSubjects: subjectDistribution
      };
    }
    
    // Cache control headers
    res.setHeader('Cache-Control', 'private, max-age=60');
    
    res.status(200).json({
      success: true,
      data: enhancedTests,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalCount,
        limit,
        hasNextPage: page < Math.ceil(totalCount / limit),
        hasPrevPage: page > 1
      },
      filters: {
        subject: subject || null,
        topic: topic || null,
        difficulty: difficulty || null,
        search: search || null,
        isFeatured: isFeatured || null,
        status: status || null
      },
      statistics,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error fetching full-length tests:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch tests",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

/**
 * Get single full-length test with questions (for taking test)
 * @route GET /api/tests/full-length/:testId
 */
const getFullLengthTestById = async (req, res) => {
  try {
    const { testId } = req.params;
    const userId = req.user?.id;
    
    // Check if test exists and is full-length
    const test = await Test.findOne({ 
      _id: testId, 
      testType: "full",
      isActive: true 
    })
      .populate("subject", "name description")
      .populate("topic", "name")
      .populate({
        path: "questions",
        select: "questionText questionImage options difficulty marks negativeMarks fact",
        options: { lean: true }
      });
    
    if (!test) {
      return res.status(404).json({
        success: false,
        message: "Test not found or not available"
      });
    }
    
    // Check if user has already attempted the test
    let existingAttempt = null;
    if (userId) {
      existingAttempt = await Attempt.findOne({
        user: userId,
        test: testId,
        status: { $in: ["completed", "in-progress", "paused"] }
      }).select("status score submittedAt");
      
      if (existingAttempt && existingAttempt.status === "completed") {
        return res.status(400).json({
          success: false,
          message: "You have already completed this test",
          attempt: {
            id: existingAttempt._id,
            score: existingAttempt.score,
            submittedAt: existingAttempt.submittedAt
          }
        });
      }
    }
    
    // Prepare test data (hide correct answers)
    const testData = test.toObject();
    testData.questions = testData.questions.map(question => ({
      ...question,
      correctAnswer: undefined // Remove correct answer
    }));
    
    // Add attempt info if exists
    if (existingAttempt && existingAttempt.status === "in-progress") {
      testData.resumeAttempt = {
        attemptId: existingAttempt._id,
        status: "in-progress"
      };
    }
    
    res.status(200).json({
      success: true,
      data: testData,
      canResume: !!(existingAttempt && existingAttempt.status === "in-progress"),
      attemptStatus: existingAttempt?.status || null
    });
  } catch (error) {
    console.error("Error fetching test details:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch test details"
    });
  }
};

/**
 * Get featured/popular full-length tests
 * @route GET /api/tests/full-length/featured
 */
const getFeaturedFullLengthTests = async (req, res) => {
  try {
    const userId = req.user?.id;
    
    const featuredTests = await Test.find({ 
      testType: "full", 
      isActive: true,
      isFeatured: true // Add this field to your Test schema if needed
    })
      .populate("subject", "name")
      .populate("topic", "name")
      .select("-questions")
      .limit(6)
      .lean();
    
    // If no featured tests, get most recent tests
    const tests = featuredTests.length > 0 ? featuredTests : 
      await Test.find({ testType: "full", isActive: true })
        .populate("subject", "name")
        .populate("topic", "name")
        .select("-questions")
        .sort({ createdAt: -1 })
        .limit(6)
        .lean();
    
    // Get attempt counts for these tests
    let attemptsMap = new Map();
    if (userId && tests.length > 0) {
      const testIds = tests.map(t => t._id);
      const attempts = await Attempt.find({
        user: userId,
        test: { $in: testIds },
        status: "completed"
      }).select("test").lean();
      
      attempts.forEach(attempt => {
        attemptsMap.set(attempt.test.toString(), true);
      });
    }
    
    const enhancedTests = tests.map(test => ({
      ...test,
      attempted: attemptsMap.has(test._id.toString()),
      totalQuestions: test.questions?.length || 0
    }));
    
    res.status(200).json({
      success: true,
      data: enhancedTests
    });
  } catch (error) {
    console.error("Error fetching featured tests:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch featured tests"
    });
  }
};

/**
 * Get filter options for full-length tests
 * @route GET /api/tests/full-length/filters/options
 */
const getTestFilterOptions = async (req, res) => {
  try {
    const [subjects, topics, difficultyLevels] = await Promise.all([
      Test.distinct("subject", { testType: "full", isActive: true }),
      Test.distinct("topic", { testType: "full", isActive: true }),
      ["easy", "medium", "hard"]
    ]);
    
    // Populate subject names
    const Subject = require("../models/Subject");
    const populatedSubjects = await Subject.find({ 
      _id: { $in: subjects } 
    }).select("name");
    
    const Topic = require("../models/Topic");
    const populatedTopics = await Topic.find({ 
      _id: { $in: topics } 
    }).select("name");
    
    res.status(200).json({
      success: true,
      data: {
        subjects: populatedSubjects.map(s => ({ id: s._id, name: s.name })),
        topics: populatedTopics.map(t => ({ id: t._id, name: t.name })),
        difficultyLevels: difficultyLevels.map(d => ({ 
          value: d, 
          label: d.charAt(0).toUpperCase() + d.slice(1) 
        }))
      }
    });
  } catch (error) {
    console.error("Error fetching filter options:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch filter options"
    });
  }
};


module.exports = {
  getTestsByTopicAndSubject,
  getTestsBySubject,
  getAttemptsByTest,
  getFullLengthTests,
  getFullLengthTestById,
  getFeaturedFullLengthTests,
  getTestFilterOptions
};