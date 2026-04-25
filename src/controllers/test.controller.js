// get all tests for a topic and subject
const Test = require("../models/Test");
const Attempt = require("../models/Attempt");
const mongoose = require("mongoose");
const ApiError = require("../utils/apiError");
const Subject = require("../models/subject.model");
const Topic = require("../models/topic.model");
const Question = require("../models/Question");

/**
 * Create a new test (draft or template) for flat test , section-based test, topic-wise, subject-wise, full test, scheuled test, recurring test etc. with all necessary validations and error handling 
 */
// The best and bigger controller I did so far. 
// ================= HELPERS =================

const validateReferences = async ({
  subject,
  topic,
  subjects,
  parentTest,
  session,
}) => {
  if (parentTest) return;

  if (subject) {
    const exists = await Subject.findById(subject).session(session);
    if (!exists) throw new Error("Referenced subject not found");
  }

  if (topic) {
    const topicDoc = await Topic.findById(topic).session(session);
    if (!topicDoc) throw new Error("Referenced topic not found");

    if (subject && topicDoc.subject?.toString() !== subject) {
      throw new Error("Topic does not belong to the specified subject");
    }
  }

  if (subjects?.length) {
    const found = await Subject.find({ _id: { $in: subjects } }).session(
      session
    );
    if (found.length !== subjects.length) {
      throw new Error("One or more referenced subjects not found");
    }
  }
};

const buildBaseTestData = (body, userId) => {
  return {
    title: body.title?.trim(),
    description: body.description?.trim() || "",
    scheduleType: body.scheduleType || "one-time",
    recurrence: body.recurrence || null,
    totalMarks: body.totalMarks || 0,
    maxAttempts: body.maxAttempts || 1,
    allowResume: !!body.allowResume,
    shuffleQuestions: !!body.shuffleQuestions,
    showResultImmediately: !!body.showResultImmediately,
    hasSections: !!body.hasSections,
    isFeatured: !!body.isFeatured,
    testType: body.testType,
    negativeMarks: body.negativeMarks || 0,
    createdBy: userId,
    isPublished: false,
    questions: [],
    sections: [],
  };
};

const handleSections = (testData, body) => {
  if (!testData.hasSections) {
    if (!body.duration || body.duration < 1) {
      throw new Error("Duration is required for tests without sections");
    }
    testData.duration = parseInt(body.duration);
    return;
  }

  if (!body.sections?.length) {
    throw new Error("Sections are required when hasSections is true");
  }

  testData.sections = body.sections.map((s) => ({
    title: s.title.trim(),
    duration: s.duration,
    questions: [],
  }));
};

const handleTestType = (testData, body) => {
  const { testType, subject, topic, subjects } = body;

  if (!["topic", "subject", "full"].includes(testType)) {
    throw new Error("Invalid testType");
  }

  if (testType === "topic") {
    if (!subject || !topic) throw new Error("Subject & Topic required");
    testData.subject = subject;
    testData.topic = topic;
    testData.subjects = [];
  }

  if (testType === "subject") {
    if (!subject) throw new Error("Subject required");
    testData.subject = subject;
    testData.topic = null;
    testData.subjects = [];
  }

  if (testType === "full") {
    if (!subjects?.length) throw new Error("At least one subject required");
    testData.subjects = subjects;
    testData.subject = null;
    testData.topic = null;
  }
};

const handleTemplateCreation = (testData, body) => {
  if (!body.recurrence?.timeOfDay) {
    throw new Error("Template must define recurrence with timeOfDay");
  }

  testData.isTemplate = true;
  testData.startTime = null;
  testData.endTime = null;
  testData.validForDate = null;
  testData.parentTest = null;
};

const handleInstanceFromTemplate = async (
  testData,
  body,
  session
) => {
  const parent = await Test.findById(body.parentTest).session(session);
  if (!parent) throw new Error("Parent template not found");

  if (!body.validForDate) {
    throw new Error("validForDate is required");
  }

  const exists = await Test.findOne({
    parentTest: parent._id,
    validForDate: new Date(body.validForDate),
  }).session(session);

  if (exists) throw new Error("Test already exists for this date");

  // Copy
  Object.assign(testData, {
    title: `${parent.title} - ${body.validForDate}`,
    description: parent.description,
    parentTest: parent._id,
    recurrence: null,
    duration: parent.duration,
    shuffleQuestions: parent.shuffleQuestions,
    showResultImmediately: parent.showResultImmediately,
    allowResume: parent.allowResume,
    maxAttempts: parent.maxAttempts,
    isFeatured: parent.isFeatured,
    scheduleType: parent.scheduleType,
    hasSections: parent.hasSections,
    sections: parent.sections.map((s) => ({
      title: s.title,
      duration: s.duration,
      questions: [],
    })),
    testType: parent.testType,
    subject: parent.subject || null,
    topic: parent.topic || null,
    subjects: parent.subjects || [],
    totalMarks: parent.totalMarks,
    negativeMarks: parent.negativeMarks,
  });

  const date = new Date(body.validForDate);
  const [h, m] = parent.recurrence.timeOfDay.split(":");

  const start = new Date(date);
  start.setHours(h, m, 0, 0);

  const duration = parent.hasSections
    ? parent.sections.reduce((a, s) => a + s.duration, 0)
    : parent.duration;

  testData.startTime = start;
  testData.endTime = new Date(start.getTime() + duration * 60000);
  testData.validForDate = date;
};

const handleNormalTest = (testData, body) => {
  testData.isTemplate = false;

  if (body.scheduleType === "one-time") {
    if (!body.startTime || !body.endTime) {
      throw new Error("startTime and endTime required");
    }

    testData.startTime = new Date(body.startTime);
    testData.endTime = new Date(body.endTime);
  }

  testData.validForDate = body.validForDate
    ? new Date(body.validForDate)
    : null;
};

const buildDuplicateQuery = (testData, userId) => {
  const base = {
    title: new RegExp(`^${testData.title}$`, "i"),
    createdBy: userId,
    isTemplate: testData.isTemplate,
  };

  if (testData.testType === "topic") {
    return {
      ...base,
      topic: testData.topic,
    };
  }

  if (testData.testType === "subject") {
    return {
      ...base,
      subject: testData.subject,
    };
  }

  if (testData.testType === "full") {
    return {
      ...base,
      subjects: { $all: testData.subjects, $size: testData.subjects.length },
    };
  }

  return base;
};
// ================= CONTROLLER =================

const createTest = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const body = req.body;

    // Basic validation
    if (!body.parentTest && !body.title?.trim()) {
      throw new Error("Test title is required");
    }

    // Validate refs
    await validateReferences({ ...body, session });

    // Build base
    const testData = buildBaseTestData(body, req.user.id);

    if (!body.parentTest) {
      handleSections(testData, body);
      handleTestType(testData, body);
    }

    // Template / Instance / Normal
    if (body.isTemplate) {
      handleTemplateCreation(testData, body);
    } else if (body.parentTest) {
      await handleInstanceFromTemplate(testData, body, session);
    } else {
      handleNormalTest(testData, body);
    }

    // Duplicate title check
    const duplicateQuery = buildDuplicateQuery(testData, req.user.id);

const existing = await Test.findOne(duplicateQuery).session(session);

if (existing) {
  throw new Error("A test with this title already exists in the same scope");
}

    if (existing) {
      throw new Error("Test with similar title exists");
    }

    const test = await new Test(testData).save({ session });

    await session.commitTransaction();

    return res.status(201).json({
      success: true,
      message: testData.isTemplate
        ? "Template created"
        : "Test created",
      data: {
        id: test._id,
        title: test.title,
        testType: test.testType,
        isTemplate: test.isTemplate,
        isPublished: test.isPublished,
      },
    });
  } catch (error) {
    await session.abortTransaction();

    const status =
      error.code === 11000
        ? 409
        : error.name === "ValidationError"
        ? 400
        : 400;

    return res.status(status).json({
      success: false,
      message: error.message || "Failed to create test",
    });
  } finally {
    session.endSession();
  }
};

/**
 * 
 * add questions to a test (supports both section-based and flat tests)
 */

const addQuestionsToTest = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { testId } = req.params;
    const { questionIds, sectionIndex } = req.body;

    // ================= VALIDATION =================
    if (!testId) {
      throw new Error("Test ID is required");
    }

    if (!questionIds || !Array.isArray(questionIds) || questionIds.length === 0) {
      throw new Error("At least one question ID is required");
    }

    // Validate question IDs (your existing validation - works perfectly)
    for (const qId of questionIds) {
      if (!mongoose.Types.ObjectId.isValid(qId)) {
        throw new Error(`Invalid question ID: ${qId}`);
      }
      const questionExists = await Question.exists({ _id: qId }).session(session);
      if (!questionExists) {
        throw new Error(`Question not found: ${qId}`);
      }
    }

    // Find the test
    const test = await Test.findById(testId).session(session);
    
    if (!test) {
      throw new Error("Test not found");
    }

    // Check if user owns this test (optional - add if needed)
    if (test.createdBy.toString() !== req.user.id) {
      throw new Error("You don't have permission to modify this test");
    }

    // Check if test is already published
    if (test.isPublished) {
      throw new Error("Cannot add questions to a published test");
    }

    // ================= ADD QUESTIONS BASED ON TEST TYPE =================
    
    if (test.hasSections) {
      // For section-based tests
      if (sectionIndex === undefined) {
        throw new Error("sectionIndex is required for section-based tests");
      }
      
      if (sectionIndex < 0 || sectionIndex >= test.sections.length) {
        throw new Error("Invalid section index");
      }
      
      // Add questions to the specific section
      test.sections[sectionIndex].questions.push(...questionIds);
      
    } else {
      // For flat tests (no sections)
      test.questions.push(...questionIds);
    }

    // Remove duplicates if any
    if (test.hasSections) {
      test.sections[sectionIndex].questions = [...new Set(
        test.sections[sectionIndex].questions.map(id => id.toString())
      )];
    } else {
      test.questions = [...new Set(test.questions.map(id => id.toString()))];
    }

    // Optional: Auto-calculate total marks based on questions
    if (test.totalMarks === 0) {
      // Fetch all questions to sum their marks
      let allQuestionIds = test.hasSections 
        ? test.sections.flatMap(s => s.questions)
        : test.questions;
      
      const questions = await Question.find(
        { _id: { $in: allQuestionIds } },
        { marks: 1 }
      ).session(session);
      
      test.totalMarks = questions.reduce((sum, q) => sum + (q.marks || 0), 0);
    }

    // Save the test
    await test.save({ session });
    
    await session.commitTransaction();
    session.endSession();

    // Return response
    return res.status(200).json({
      success: true,
      message: "Questions added successfully",
      data: {
        testId: test._id,
        testTitle: test.title,
        totalQuestions: test.hasSections 
          ? test.sections[sectionIndex].questions.length 
          : test.questions.length,
        totalMarks: test.totalMarks,
        sectionIndex: test.hasSections ? sectionIndex : undefined
      }
    });

  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();

    return res.status(400).json({
      success: false,
      message: error.message || "Failed to add questions"
    });
  }
};

/**
 * Alternative: Batch add questions with better performance
 */
const addQuestionsToTestBatch = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { testId } = req.params;
    const { questionIds, sectionIndex } = req.body;

    if (!testId || !questionIds?.length) {
      throw new Error("Test ID and question IDs are required");
    }

    // Validate all question IDs in one query (more efficient)
    const validQuestions = await Question.find(
      { _id: { $in: questionIds } },
      { _id: 1 }
    ).session(session);
    
    const validIds = validQuestions.map(q => q._id.toString());
    const invalidIds = questionIds.filter(id => !validIds.includes(id));
    
    if (invalidIds.length > 0) {
      throw new Error(`Invalid question IDs: ${invalidIds.join(", ")}`);
    }

    const test = await Test.findById(testId).session(session);
    
    if (!test) {
      throw new Error("Test not found");
    }

    if (test.isPublished) {
      throw new Error("Cannot modify a published test");
    }

    // Add questions
    if (test.hasSections) {
      if (sectionIndex === undefined || sectionIndex >= test.sections.length) {
        throw new Error("Valid sectionIndex required");
      }
      test.sections[sectionIndex].questions.push(...questionIds);
      test.sections[sectionIndex].questions = [...new Set(
        test.sections[sectionIndex].questions.map(id => id.toString())
      )];
    } else {
      test.questions.push(...questionIds);
      test.questions = [...new Set(test.questions.map(id => id.toString()))];
    }

    await test.save({ session });
    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      success: true,
      message: "Questions added successfully",
      data: {
        testId: test._id,
        addedCount: questionIds.length,
        totalQuestions: test.hasSections 
          ? test.sections[sectionIndex]?.questions.length 
          : test.questions.length
      }
    });

  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction();
    session.endSession();
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
};


/**
 * Remove questions from a test
 */
const removeQuestionsFromTest = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { testId } = req.params;
    const { questionIds, sectionIndex } = req.body;

    if (!testId) {
      throw new Error("Test ID is required");
    }

    if (!questionIds || !Array.isArray(questionIds) || questionIds.length === 0) {
      throw new Error("At least one question ID is required");
    }

    const test = await Test.findById(testId).session(session);
    
    if (!test) {
      throw new Error("Test not found");
    }

    if (test.isPublished) {
      throw new Error("Cannot remove questions from a published test");
    }

    // Remove questions
    if (test.hasSections) {
      if (sectionIndex === undefined) {
        throw new Error("sectionIndex is required for section-based tests");
      }
      
      if (sectionIndex < 0 || sectionIndex >= test.sections.length) {
        throw new Error("Invalid section index");
      }

      // check if question IDs exist in the section before attempting to remove
      const currentQuestions = test.sections[sectionIndex].questions.map(q => q.toString());
      const allExist = questionIds.every(id => currentQuestions.includes(id));
      if (!allExist) {
        throw new Error("Some question IDs do not exist in this section");
      }
      
      test.sections[sectionIndex].questions = test.sections[sectionIndex].questions.filter(
        q => !questionIds.includes(q.toString())
      );
    } else {
      
      // check if question IDs exist in the test before attempting to remove
      const currentQuestions = test.questions.map(q => q.toString());
      console.log("Current questions in test:", currentQuestions);
      const allExist = questionIds.every(id => currentQuestions.includes(id));
      console.log("All question IDs exist in test?", allExist);
      if (!allExist) {
        throw new Error("Some question IDs do not exist in this test");
      }
      test.questions = test.questions.filter(
        q => !questionIds.includes(q.toString())
      );
    }

    // Recalculate total marks if needed
    if (test.totalMarks > 0) {
      let allQuestionIds = test.hasSections 
        ? test.sections.flatMap(s => s.questions)
        : test.questions;
      
      const questions = await Question.find(
        { _id: { $in: allQuestionIds } },
        { marks: 1 }
      ).session(session);
      
      test.totalMarks = questions.reduce((sum, q) => sum + (q.marks || 0), 0);
    }

    await test.save({ session });
    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      success: true,
      message: "Questions removed successfully",
      data: {
        testId: test._id,
        removedCount: questionIds.length,
        remainingQuestions: test.hasSections 
          ? test.sections[sectionIndex]?.questions.length || 0
          : test.questions.length,
        totalMarks: test.totalMarks
      }
    });

  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();

    return res.status(400).json({
      success: false,
      message: error.message || "Failed to remove questions"
    });
  }
};


/**
 * Update questions order in a test
 */
const reorderQuestions = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { testId } = req.params;
    const { questionIds, sectionIndex } = req.body;

    // ================= VALIDATION =================
    if (!testId) {
      throw new Error("Test ID is required");
    }

    if (!questionIds || !Array.isArray(questionIds) || questionIds.length === 0) {
      throw new Error("Question IDs array is required");
    }

    // Find the test
    const test = await Test.findById(testId).session(session);
    
    if (!test) {
      throw new Error("Test not found");
    }

    if (test.isPublished) {
      throw new Error("Cannot reorder questions in a published test");
    }

    // ================= REORDER QUESTIONS =================
    
    if (test.hasSections) {
      if (sectionIndex === undefined) {
        throw new Error("sectionIndex is required for section-based tests");
      }
      
      if (sectionIndex < 0 || sectionIndex >= test.sections.length) {
        throw new Error("Invalid section index");
      }
      
      // Verify all question IDs exist in the section
      const currentQuestions = test.sections[sectionIndex].questions.map(q => q.toString());
      const allExist = questionIds.every(id => currentQuestions.includes(id));
      
      if (!allExist) {
        throw new Error("Some question IDs do not exist in this section");
      }
      
      // Update order
      test.sections[sectionIndex].questions = questionIds;
      
    } else {
      // Verify all question IDs exist in the test
      const currentQuestions = test.questions.map(q => q.toString());
      const allExist = questionIds.every(id => currentQuestions.includes(id));
      
      if (!allExist) {
        throw new Error("Some question IDs do not exist in this test");
      }
      
      // Update order
      test.questions = questionIds;
    }

    // Save the test
    await test.save({ session });
    
    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      success: true,
      message: "Questions reordered successfully"
    });

  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();

    return res.status(400).json({
      success: false,
      message: error.message || "Failed to reorder questions"
    });
  }
};

/**
 * Get all questions in a test
 */
const getTestQuestions = async (req, res) => {
  try {
    const { testId } = req.params;

    if (!testId) {
      throw new Error("Test ID is required");
    }

    // 🔥 Populate BOTH flat + section questions
    const test = await Test.findById(testId)
      .populate({
        path: "questions",
        select: "questionText subject topic marks options",
        populate: [
          { path: "subject", select: "name" },
          { path: "topic", select: "name" }
        ]
      })
      .populate({
        path: "sections.questions",
        select: "questionText subject topic marks options",
        populate: [
          { path: "subject", select: "name" },
          { path: "topic", select: "name" }
        ]
      })
      .lean(); // 🔥 performance boost

    if (!test) {
      throw new Error("Test not found");
    }

    let questions;

    if (test.hasSections) {
      questions = test.sections.map((section, index) => ({
        sectionIndex: index,
        sectionTitle: section.title,
        sectionDuration: section.duration,
        questions: section.questions // ✅ now populated
      }));
    } else {
      questions = test.questions; // ✅ already populated
    }

    return res.status(200).json({
      success: true,
      data: {
        testId: test._id,
        testTitle: test.title,
        hasSections: test.hasSections,
        totalQuestions: test.hasSections
          ? test.sections.reduce((sum, s) => sum + s.questions.length, 0)
          : test.questions.length,
        questions,
      }
    });

  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to get questions"
    });
  }
};

/**
 * Get tests with filters (topic-wise, subject-wise, full-length, scheduled, sectional) and user attempt status for each test (canStart, canResume, canViewResult) 
 */
const buildFilter = ({ type, subjectId, topicId }) => {
  const now = new Date();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const filter = {
    isTemplate: false,
    isPublished: true
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
const getTests = async (req, res) => {
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


/**
 * Get Test by ID with detailed info and user attempt status (canStart, canResume, canViewResult)
 */
const getTestById = async (req, res) => {
  try {
    const { testId } = req.params;

    if (!testId) {
      throw new Error("Test ID is required");
    }

    const test = await Test.findById(testId)
      // 🔹 Test level population
      .populate("subject", "name")
      .populate("topic", "name")
      .populate("subjects", "name")

      // 🔹 Flat questions
      .populate({
        path: "questions",
        select: "questionText options difficulty marks subject topic",
        populate: [
          { path: "subject", select: "name" },
          { path: "topic", select: "name" }
        ]
      })

      // 🔹 Section questions
      .populate({
        path: "sections.questions",
        select: "questionText options difficulty marks subject topic",
        populate: [
          { path: "subject", select: "name" },
          { path: "topic", select: "name" }
        ]
      })

      .lean(); // 🔥 important for performance

    if (!test) {
      throw new Error("Test not found");
    }

    return res.status(200).json({
      success: true,
      data: test
    });

  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to fetch test details"
    });
  }
};


// get templates
const getAllTemplates = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      scheduleType, // daily / weekly / monthly
      search
    } = req.query;

    const skip = (page - 1) * limit;

    // =========================
    // 🔥 BUILD FILTER
    // =========================
    const filter = {
      isTemplate: true
    };

    if (scheduleType && scheduleType !== "all") {
      filter.scheduleType = scheduleType;
    }

    // 🔍 Search by title
    if (search) {
      filter.$text = { $search: search };
    }

    // =========================
    // 🚀 QUERY
    // =========================
    const templates = await Test.find(filter)
      .select(`
        title
        description
        scheduleType
        recurrence
        testType
        subject
        topic
        subjects
        totalMarks
        hasSections
        createdAt
      `)
      .populate("subject", "name")
      .populate("topic", "name")
      .populate("subjects", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // =========================
    // 📊 COUNT
    // =========================
    const totalCount = await Test.countDocuments(filter);

    // =========================
    // 🎯 FORMAT RESPONSE
    // =========================
    const formatted = templates.map(t => {
      let subjectsData;

      if (t.testType === "full") {
        subjectsData = t.subjects?.map(s => s.name) || [];
      } else {
        subjectsData = t.subject?.name || "N/A";
      }

      return {
        templateId: t._id,
        title: t.title,
        description: t.description,

        scheduleType: t.scheduleType,
        recurrence: t.recurrence,

        testType: t.testType,
        subject: subjectsData,
        topic: t.topic?.name || null,

        totalMarks: t.totalMarks,
        hasSections: t.hasSections,

        createdAt: t.createdAt
      };
    });

    // =========================
    // ✅ RESPONSE
    // =========================
    res.status(200).json({
      success: true,
      data: formatted,
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

// Unified Test

const getAllTests = async (req, res) => {
  try {
    const userId = req.user?.id;

    // =========================
    // 📥 QUERY PARAMS
    // =========================
    const {
      type,        // topic | subject | full
      structure,   // flat | sectional
      subjectId,
      topicId,
      status,      // upcoming | ongoing | completed
      search,
      page = 1,
      limit = 10,
    } = req.query;

    const skip = (page - 1) * limit;
    const now = new Date();

    // =========================
    // 🧠 BUILD FILTER
    // =========================
    const filter = {
      isPublished: true,
    };

    // =========================
    // 🔥 SCOPE FILTER (type)
    // =========================
    if (type === "topic") {
      filter.testType = "topic";
      if (subjectId) filter.subject = subjectId;
      if (topicId) filter.topic = topicId;
    }

    if (type === "subject") {
      filter.testType = "subject";
      if (subjectId) filter.subject = subjectId;
      filter.topic = null;
    }

    if (type === "full") {
      filter.testType = "full";
      if (subjectId) {
        filter.subjects = { $in: [subjectId] };
      }
    }

    // =========================
    // 🔥 STRUCTURE FILTER
    // =========================
    if (structure === "flat") {
      filter.hasSections = false;
    }

    if (structure === "sectional") {
      filter.hasSections = true;
    }

    // =========================
    // 🔥 STATUS FILTER
    // =========================
    if (status === "upcoming") {
      filter.startTime = { $gt: now };
    } else if (status === "ongoing") {
      filter.startTime = { $lte: now };
      filter.endTime = { $gte: now };
    } else if (status === "completed") {
      filter.endTime = { $lt: now };
    }

    // =========================
    // 🔍 SEARCH
    // =========================
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    // =========================
    // 🚀 FETCH TESTS
    // =========================
    const tests = await Test.find(filter)
      .select(`
        title description testType
        subject topic subjects
        questions sections hasSections
        duration totalMarks
        startTime endTime maxAttempts
      `)
      .populate("subject", "name")
      .populate("topic", "name")
      .populate("subjects", "name")
      .sort({ startTime: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const totalCount = await Test.countDocuments(filter);

    if (!tests.length) {
      return res.json({
        success: true,
        data: [],
        pagination: {
          totalCount: 0,
          totalPages: 0,
          currentPage: parseInt(page),
          limit: parseInt(limit),
        },
      });
    }

    const testIds = tests.map((t) => t._id);

    // =========================
    // 📊 FETCH ATTEMPTS
    // =========================
    const attempts = userId
      ? await Attempt.find({
          user: userId,
          test: { $in: testIds },
        })
          .select("test status createdAt")
          .sort({ createdAt: 1 }) // oldest first
          .lean()
      : [];

    // =========================
    // 🧠 GROUP ATTEMPTS
    // =========================
    const attemptMap = {};

    for (const attempt of attempts) {
      const key = attempt.test.toString();
      if (!attemptMap[key]) attemptMap[key] = [];
      attemptMap[key].push(attempt);
    }

    // =========================
    // 🔢 HELPER: TOTAL QUESTIONS
    // =========================
    const getTotalQuestions = (test) => {
      if (!test.hasSections) return test.questions?.length || 0;

      return test.sections?.reduce(
        (acc, sec) => acc + (sec.questions?.length || 0),
        0
      );
    };

    // =========================
    // ⏱️ HELPER: TOTAL DURATION (for sectional tests)
    // =========================
    const getTotalDuration = (test) => {
      // For flat tests, return the duration field
      if (!test.hasSections) {
        return test.duration || 0;
      }
      
      // For sectional tests, sum up all section durations
      if (test.hasSections && test.sections && test.sections.length > 0) {
        return test.sections.reduce((total, section) => {
          return total + (section.duration || 0);
        }, 0);
      }
      
      // Fallback
      return 0;
    };

    // =========================
    // 📦 BUILD RESPONSE
    // =========================
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

      // Calculate section details for sectional tests
      let sectionDetails = null;
      if (test.hasSections && test.sections) {
        sectionDetails = {
          count: test.sections.length,
          durations: test.sections.map(s => s.duration || 0),
          titles: test.sections.map(s => s.title || `Section ${sections.indexOf(s) + 1}`)
        };
      }

      return {
        _id: test._id,
        title: test.title,
        description: test.description,

        testType: test.testType,
        hasSections: test.hasSections,
        sectionsCount: test.sections?.length || 0,
        subject: test.subject?.name || null,
        topic: test.topic?.name || null,
        subjects: test.subjects?.map((s) => s.name) || [],

        totalQuestions: getTotalQuestions(test),
        duration: getTotalDuration(test), // FIXED: Now returns correct duration for sectional tests
        totalMarks: test.totalMarks,

        startTime: test.startTime,
        endTime: test.endTime,

        maxAttempts: test.maxAttempts,

        // Optional: Include section details for sectional tests
        ...(sectionDetails && { sectionDetails }),

        // 🔥 ATTEMPT LOGIC
        attemptCount,
        remainingAttempts,

        canResume: !!activeAttempt,
        canViewResult: completedAttempts.length > 0,
        canStart:
          !activeAttempt &&
          (test.maxAttempts === -1 || remainingAttempts > 0),

        activeAttemptId: activeAttempt?._id || null,
        oldestCompletedAttemptId: oldestCompleted?._id || null,
        completedAttemptsCount: completedAttempts.length,
      };
    });

    // =========================
    // ✅ FINAL RESPONSE
    // =========================
    return res.json({
      success: true,
      data: finalTests,
      pagination: {
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: parseInt(page),
        limit: parseInt(limit),
      },
    });

  } catch (error) {
    console.error("Unified test fetch error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

/**
 * =============================================================== EXISTING ENDPOINTS (NEED REFACTORING) ===============================================================
 */
// new updated
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

    const now = new Date();

    // =========================
    // 🚀 FETCH TESTS (FIXED FILTER)
    // =========================
    const tests = await Test.find({
      subject: subjectId,
      topic: topicId,
      isPublished: true,

      // 🔥 IMPORTANT
      startTime: { $lte: now },
      endTime: { $gte: now }
    })
      .select(`
        title description subject topic
        questions sections hasSections
        duration totalMarks
        startTime endTime
        maxAttempts
      `)
      .populate("subject", "name")
      .populate("topic", "name")
      .lean();

    if (!tests.length) {
      return res.status(200).json({
        tests: [],
        message: "No tests found",
      });
    }

    const testIds = tests.map((t) => t._id);

    // =========================
    // 📊 FETCH ATTEMPTS
    // =========================
    const attempts = await Attempt.find({
      user: userId,
      test: { $in: testIds },
    })
      .select("test status createdAt")
      .sort({ createdAt: 1 })
      .lean();

    // =========================
    // 🧠 GROUP ATTEMPTS
    // =========================
    const attemptMap = {};

    for (const attempt of attempts) {
      const key = attempt.test.toString();
      if (!attemptMap[key]) attemptMap[key] = [];
      attemptMap[key].push(attempt);
    }

    // =========================
    // 📦 BUILD RESPONSE
    // =========================
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

      // =========================
      // ✅ TOTAL QUESTIONS FIX
      // =========================
      let totalQuestions = 0;

      if (!test.hasSections) {
        totalQuestions = test.questions?.length || 0;
      } else {
        totalQuestions = test.sections?.reduce(
          (acc, sec) => acc + (sec.questions?.length || 0),
          0
        );
      }

      return {
        _id: test._id,
        title: test.title,
        description: test.description,

        subject: test.subject?.name || null,
        topic: test.topic?.name || null,

        totalQuestions,
        duration: test.duration,
        totalMarks: test.totalMarks,

        startTime: test.startTime,
        endTime: test.endTime,

        maxAttempts: test.maxAttempts,

        attemptCount,
        remainingAttempts,

        // 🔥 CAPABILITY FLAGS
        canResume: !!activeAttempt,
        canViewResult: completedAttempts.length > 0,
        canStart:
          !activeAttempt &&
          (test.maxAttempts === -1 || remainingAttempts > 0),

        // 🔥 IDS
        activeAttemptId: activeAttempt?._id || null,
        oldestCompletedAttemptId: oldestCompleted?._id || null,
        completedAttemptsCount: completedAttempts.length,
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

    // =========================
    // ✅ VALIDATION
    // =========================
    if (!subjectId || !mongoose.Types.ObjectId.isValid(subjectId)) {
      return res.status(400).json({
        tests: [],
        message: "Valid Subject ID is required",
      });
    }

    const now = new Date();

    // =========================
    // 🚀 FETCH TESTS (FIXED)
    // =========================
    const tests = await Test.find({
      subject: subjectId,
      topic: null,
      isPublished: true,

      // 🔥 TIME FILTER
      startTime: { $lte: now },
      endTime: { $gte: now },
    })
      .select(`
        title description subject
        questions sections hasSections
        duration totalMarks
        startTime endTime maxAttempts
      `)
      .populate("subject", "name")
      .lean();

    if (!tests.length) {
      return res.status(200).json({
        tests: [],
        message: "No tests found",
      });
    }

    const testIds = tests.map((t) => t._id);

    // =========================
    // 📊 FETCH ATTEMPTS
    // =========================
    const attempts = await Attempt.find({
      user: userId,
      test: { $in: testIds },
    })
      .select("test status createdAt")
      .sort({ createdAt: 1 })
      .lean();

    // =========================
    // 🧠 GROUP ATTEMPTS
    // =========================
    const attemptMap = {};

    for (const attempt of attempts) {
      const key = attempt.test.toString();
      if (!attemptMap[key]) attemptMap[key] = [];
      attemptMap[key].push(attempt);
    }

    // =========================
    // 📦 BUILD RESPONSE
    // =========================
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

      // =========================
      // ✅ TOTAL QUESTIONS FIX
      // =========================
      let totalQuestions = 0;

      if (!test.hasSections) {
        totalQuestions = test.questions?.length || 0;
      } else {
        totalQuestions = test.sections?.reduce(
          (acc, sec) => acc + (sec.questions?.length || 0),
          0
        );
      }

      return {
        _id: test._id,
        title: test.title,
        description: test.description,

        subject: test.subject?.name || null,

        totalQuestions,
        duration: test.duration,
        totalMarks: test.totalMarks,

        startTime: test.startTime,
        endTime: test.endTime,
        maxAttempts: test.maxAttempts,

        // 🔥 ATTEMPT DATA
        attemptCount,
        completedAttemptsCount,
        remainingAttempts,

        // 🔥 UI FLAGS
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

// get all attempts of a test for an user--done
const getAttemptsByTest = async (req, res) => {
  try {
    const { testId } = req.params;
    const userId = req.user.id;

    const attempts = await Attempt.find({
      user: userId,
      test: testId,
      status: "completed",
    })
      .sort({ createdAt: -1 }) // latest first
      .select("score createdAt submittedAt duration totalMarks");

    return res.json({
      testId,
      count: attempts.length,
      attempts,
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
      status, // "upcoming", "ongoing", "completed"
    } = req.query;

    const currentDate = new Date();

    // Build query
    const query = {
      testType: "full",
      isPublished: true, // Use isPublished instead of isActive
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
        { description: { $regex: search, $options: "i" } },
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
      userId && testIds.length > 0
        ? Attempt.find({
            user: userId,
            test: { $in: testIds },
          })
            .select(
              "test score totalMarks status submittedAt startedAt remainingTime currentQuestionIndex"
            )
            .sort({ submittedAt: -1 })
            .lean()
        : Promise.resolve([]),
    ]);

    // Create a map of user attempts (group by test)
    const attemptsMap = new Map();
    userAttempts.forEach((attempt) => {
      const testId = attempt.test.toString();
      if (!attemptsMap.has(testId)) {
        attemptsMap.set(testId, []);
      }
      attemptsMap.get(testId).push({
        attemptId: attempt._id,
        score: attempt.score,
        totalMarks: attempt.totalMarks,
        percentage:
          attempt.totalMarks > 0
            ? (attempt.score / attempt.totalMarks) * 100
            : 0,
        status: attempt.status,
        submittedAt: attempt.submittedAt,
        startedAt: attempt.startedAt,
        remainingTime: attempt.remainingTime,
        currentQuestionIndex: attempt.currentQuestionIndex,
      });
    });

    // Get question counts for tests efficiently
    const testIdsForCount = tests.map((t) => t._id);
    let questionCounts = new Map();

    if (testIdsForCount.length > 0) {
      const counts = await Test.aggregate([
        { $match: { _id: { $in: testIdsForCount } } },
        {
          $project: {
            _id: 1,
            questionCount: { $size: "$questions" },
          },
        },
      ]);

      counts.forEach((count) => {
        questionCounts.set(count._id.toString(), count.questionCount);
      });
    }

    // Enhance tests with attempt status and metadata
    const enhancedTests = tests.map((test) => {
      const testObj = { ...test };
      const attempts = attemptsMap.get(test._id.toString()) || [];
      const completedAttempts = attempts.filter(
        (a) => a.status === "completed"
      );
      const inProgressAttempt = attempts.find(
        (a) => a.status === "in-progress" || a.status === "paused"
      );

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
      testObj.remainingAttempts = Math.max(
        0,
        (test.maxAttempts || 1) - attempts.length
      );

      if (completedAttempts.length > 0) {
        const bestAttempt = completedAttempts.reduce(
          (best, current) =>
            current.percentage > best.percentage ? current : best,
          completedAttempts[0]
        );

        testObj.bestAttempt = {
          score: bestAttempt.score,
          totalMarks: bestAttempt.totalMarks,
          percentage: Math.round(bestAttempt.percentage * 100) / 100,
          submittedAt: bestAttempt.submittedAt,
        };

        testObj.lastAttempt = {
          score: completedAttempts[0].score,
          totalMarks: completedAttempts[0].totalMarks,
          percentage: Math.round(completedAttempts[0].percentage * 100) / 100,
          submittedAt: completedAttempts[0].submittedAt,
        };
      }

      if (inProgressAttempt) {
        testObj.inProgressAttempt = {
          attemptId: inProgressAttempt.attemptId,
          startedAt: inProgressAttempt.startedAt,
          remainingTime: inProgressAttempt.remainingTime,
          currentQuestionIndex: inProgressAttempt.currentQuestionIndex,
        };
      }

      // Add metadata for UI
      testObj.totalQuestions = questionCounts.get(test._id.toString()) || 0;
      testObj.testStatus = testStatus;
      testObj.isAvailable =
        testStatus === "ongoing" && testObj.remainingAttempts > 0;
      testObj.startTimeFormatted = test.startTime;
      testObj.endTimeFormatted = test.endTime;

      return testObj;
    });

    // Calculate statistics for filters
    let statistics = null;
    if (page === 1) {
      const now = new Date();
      const [
        totalTests,
        upcomingTests,
        ongoingTests,
        completedTests,
        attemptedTests,
      ] = await Promise.all([
        Test.countDocuments({ testType: "full", isPublished: true }),
        Test.countDocuments({
          testType: "full",
          isPublished: true,
          startTime: { $gt: now },
        }),
        Test.countDocuments({
          testType: "full",
          isPublished: true,
          startTime: { $lte: now },
          endTime: { $gte: now },
        }),
        Test.countDocuments({
          testType: "full",
          isPublished: true,
          endTime: { $lt: now },
        }),
        userId
          ? Attempt.countDocuments({
              user: userId,
              status: "completed",
              test: {
                $in: await Test.find({
                  testType: "full",
                  isPublished: true,
                }).distinct("_id"),
              },
            })
          : Promise.resolve(0),
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
            as: "subjectInfo",
          },
        },
        { $unwind: { path: "$subjectInfo", preserveNullAndEmptyArrays: true } },
        { $project: { subjectName: "$subjectInfo.name", count: 1 } },
      ]);

      statistics = {
        totalTests,
        upcomingTests,
        ongoingTests,
        completedTests,
        attemptedByUser: attemptedTests,
        completionRate:
          totalTests > 0 ? (attemptedTests / totalTests) * 100 : 0,
        topSubjects: subjectDistribution,
      };
    }

    // Cache control headers
    res.setHeader("Cache-Control", "private, max-age=60");

    res.status(200).json({
      success: true,
      data: enhancedTests,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalCount,
        limit,
        hasNextPage: page < Math.ceil(totalCount / limit),
        hasPrevPage: page > 1,
      },
      filters: {
        subject: subject || null,
        topic: topic || null,
        difficulty: difficulty || null,
        search: search || null,
        isFeatured: isFeatured || null,
        status: status || null,
      },
      statistics,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching full-length tests:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch tests",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
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
      isActive: true,
    })
      .populate("subject", "name description")
      .populate("topic", "name")
      .populate({
        path: "questions",
        select:
          "questionText questionImage options difficulty marks negativeMarks fact",
        options: { lean: true },
      });

    if (!test) {
      return res.status(404).json({
        success: false,
        message: "Test not found or not available",
      });
    }

    // Check if user has already attempted the test
    let existingAttempt = null;
    if (userId) {
      existingAttempt = await Attempt.findOne({
        user: userId,
        test: testId,
        status: { $in: ["completed", "in-progress", "paused"] },
      }).select("status score submittedAt");

      if (existingAttempt && existingAttempt.status === "completed") {
        return res.status(400).json({
          success: false,
          message: "You have already completed this test",
          attempt: {
            id: existingAttempt._id,
            score: existingAttempt.score,
            submittedAt: existingAttempt.submittedAt,
          },
        });
      }
    }

    // Prepare test data (hide correct answers)
    const testData = test.toObject();
    testData.questions = testData.questions.map((question) => ({
      ...question,
      correctAnswer: undefined, // Remove correct answer
    }));

    // Add attempt info if exists
    if (existingAttempt && existingAttempt.status === "in-progress") {
      testData.resumeAttempt = {
        attemptId: existingAttempt._id,
        status: "in-progress",
      };
    }

    res.status(200).json({
      success: true,
      data: testData,
      canResume: !!(
        existingAttempt && existingAttempt.status === "in-progress"
      ),
      attemptStatus: existingAttempt?.status || null,
    });
  } catch (error) {
    console.error("Error fetching test details:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch test details",
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
      isFeatured: true, // Add this field to your Test schema if needed
    })
      .populate("subject", "name")
      .populate("topic", "name")
      .select("-questions")
      .limit(6)
      .lean();

    // If no featured tests, get most recent tests
    const tests =
      featuredTests.length > 0
        ? featuredTests
        : await Test.find({ testType: "full", isActive: true })
            .populate("subject", "name")
            .populate("topic", "name")
            .select("-questions")
            .sort({ createdAt: -1 })
            .limit(6)
            .lean();

    // Get attempt counts for these tests
    let attemptsMap = new Map();
    if (userId && tests.length > 0) {
      const testIds = tests.map((t) => t._id);
      const attempts = await Attempt.find({
        user: userId,
        test: { $in: testIds },
        status: "completed",
      })
        .select("test")
        .lean();

      attempts.forEach((attempt) => {
        attemptsMap.set(attempt.test.toString(), true);
      });
    }

    const enhancedTests = tests.map((test) => ({
      ...test,
      attempted: attemptsMap.has(test._id.toString()),
      totalQuestions: test.questions?.length || 0,
    }));

    res.status(200).json({
      success: true,
      data: enhancedTests,
    });
  } catch (error) {
    console.error("Error fetching featured tests:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch featured tests",
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
      ["easy", "medium", "hard"],
    ]);

    // Populate subject names
    const Subject = require("../models/Subject");
    const populatedSubjects = await Subject.find({
      _id: { $in: subjects },
    }).select("name");

    const Topic = require("../models/Topic");
    const populatedTopics = await Topic.find({
      _id: { $in: topics },
    }).select("name");

    res.status(200).json({
      success: true,
      data: {
        subjects: populatedSubjects.map((s) => ({ id: s._id, name: s.name })),
        topics: populatedTopics.map((t) => ({ id: t._id, name: t.name })),
        difficultyLevels: difficultyLevels.map((d) => ({
          value: d,
          label: d.charAt(0).toUpperCase() + d.slice(1),
        })),
      },
    });
  } catch (error) {
    console.error("Error fetching filter options:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch filter options",
    });
  }
};

// DELETE TEST BY ID (ADMIN ONLY)
const deleteTestById = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { testId } = req.params;

    // ✅ Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(testId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid test ID",
      });
    }

    session.startTransaction();

    // ✅ Find test first (for auth check)
    const test = await Test.findById(testId).session(session);

    if (!test) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "Test not found",
      });
    }

    // ✅ Delete test
    await Test.findByIdAndDelete(testId, { session });

    // ✅ Delete related attempts
    await Attempt.deleteMany({ test: testId }, { session });

    await session.commitTransaction();

    res.status(200).json({
      success: true,
      message: "Test deleted successfully",
    });
  } catch (error) {
    await session.abortTransaction();

    console.error("Error deleting test:", error);

    res.status(500).json({
      success: false,
      message: "Failed to delete test",
    });
  } finally {
    session.endSession(); // ✅ always close session
  }
};


// Test Deatils - new
const getTestDetails = async (req, res) => {
  try {
    const { testId } = req.params;
    const userId = req.user?.id;

    if (!testId) {
      return res.status(400).json({
        success: false,
        message: "Test ID is required"
      });
    }

    // =========================
    // 🔍 FETCH TEST WITH POPULATIONS
    // =========================
    const test = await Test.findById(testId)
      .populate("subject", "name description")
      .populate("topic", "name description")
      .populate("subjects", "name description")
      .populate("createdBy", "name email")
      .lean();

    if (!test) {
      return res.status(404).json({
        success: false,
        message: "Test not found"
      });
    }

    // Check if test is published (unless user is admin/creator)
    if (!test.isPublished) {
      // Optional: Allow creator or admin to view unpublished tests
      const isCreator = test.createdBy?._id?.toString() === userId;
      const isAdmin = req.user?.role === "admin";
      
      if (!isCreator && !isAdmin) {
        return res.status(403).json({
          success: false,
          message: "Test is not published yet"
        });
      }
    }

    // =========================
    // ⏱️ HELPER: CALCULATE TOTAL DURATION
    // =========================
    const getTotalDuration = (test) => {
      if (!test.hasSections) {
        return test.duration || 0;
      }
      
      if (test.hasSections && test.sections && test.sections.length > 0) {
        return test.sections.reduce((total, section) => {
          return total + (section.duration || 0);
        }, 0);
      }
      
      return 0;
    };

    // =========================
    // 🔢 HELPER: COUNT TOTAL QUESTIONS
    // =========================
    const getTotalQuestions = (test) => {
      if (!test.hasSections) {
        return test.questions?.length || 0;
      }
      
      if (test.sections && test.sections.length > 0) {
        return test.sections.reduce((total, section) => {
          return total + (section.questions?.length || 0);
        }, 0);
      }
      
      return 0;
    };

    // =========================
    // 📊 FETCH QUESTION DETAILS (WITHOUT ANSWERS)
    // =========================
    let questionDetails = null;
    
    if (test.hasSections) {
      // For sectional tests, fetch questions for each section
      const allQuestionIds = [];
      const sectionQuestionsMap = {};
      
      test.sections.forEach((section, index) => {
        const sectionQuestionIds = section.questions || [];
        sectionQuestionsMap[index] = sectionQuestionIds;
        allQuestionIds.push(...sectionQuestionIds);
      });
      
      if (allQuestionIds.length > 0) {
        const questions = await Question.find({
          _id: { $in: allQuestionIds }
        })
        .select("text type options marks difficulty level topic tags") // Exclude correctAnswer
        .lean();
        
        // Create a map of questions by ID
        const questionMap = {};
        questions.forEach(q => {
          questionMap[q._id.toString()] = q;
        });
        
        // Build sections with populated questions
        questionDetails = test.sections.map((section, index) => {
          const sectionQuestions = (section.questions || []).map(qId => {
            const question = questionMap[qId.toString()];
            if (!question) return null;
            
            // Remove sensitive data if needed
            const { correctAnswer, ...safeQuestion } = question;
            return safeQuestion;
          }).filter(q => q !== null);
          
          return {
            sectionIndex: index,
            sectionTitle: section.title,
            sectionDuration: section.duration,
            questionsCount: sectionQuestions.length,
            questions: sectionQuestions
          };
        });
      }
    } else {
      // For flat tests, fetch all questions
      if (test.questions && test.questions.length > 0) {
        const questions = await Question.find({
          _id: { $in: test.questions }
        })
        .select("text type options marks difficulty level topic tags") // Exclude correctAnswer
        .lean();
        
        // Remove sensitive data
        questionDetails = questions.map(q => {
          const { correctAnswer, ...safeQuestion } = q;
          return safeQuestion;
        });
      }
    }

    // =========================
    // 📈 GET USER ATTEMPT INFO
    // =========================
    let attemptInfo = {
      attemptCount: 0,
      maxAttempts: test.maxAttempts,
      canAttempt: true,
      activeAttemptId: null,
      action: "start",
      completedAttempts: [],
      bestScore: null,
      averageScore: null,
      lastAttemptAt: null
    };

    if (userId) {
      // Get all attempts by this user for this test
      const attempts = await Attempt.find({
        user: userId,
        test: testId
      })
      .sort({ createdAt: -1 })
      .lean();
      
      const attemptCount = attempts.length;
      const activeAttempt = attempts.find(
        a => a.status === "in-progress" || a.status === "paused"
      );
      const completedAttempts = attempts.filter(a => a.status === "completed");
      
      // Calculate statistics
      const scores = completedAttempts.map(a => a.score);
      const bestScore = scores.length > 0 ? Math.max(...scores) : null;
      const averageScore = scores.length > 0 
        ? scores.reduce((a, b) => a + b, 0) / scores.length 
        : null;
      
      attemptInfo = {
        attemptCount,
        maxAttempts: test.maxAttempts,
        canAttempt: test.maxAttempts === -1 || attemptCount < test.maxAttempts,
        canResume: !!activeAttempt,
        activeAttemptId: activeAttempt?._id || null,
        action: activeAttempt ? "resume" : "start",
        completedAttemptsCount: completedAttempts.length,
        completedAttempts: completedAttempts.map(a => ({
          attemptId: a._id,
          score: a.score,
          percentage: a.percentage,
          submittedAt: a.submittedAt,
          status: a.status
        })),
        bestScore,
        averageScore,
        lastAttemptAt: attempts[0]?.createdAt || null
      };
      
      // Check if user can start new attempt
      if (!attemptInfo.canAttempt && !activeAttempt) {
        attemptInfo.action = "view_results";
        attemptInfo.message = "You have exhausted all attempts for this test";
      }
    }

    // =========================
    // 📝 PREPARE RESPONSE
    // =========================
    const totalDuration = getTotalDuration(test);
    const totalQuestions = getTotalQuestions(test);
    
    // Calculate total marks if not set
    let totalMarks = test.totalMarks;
    if (totalMarks === 0 && questionDetails) {
      if (test.hasSections && questionDetails) {
        totalMarks = questionDetails.reduce((sum, section) => {
          const sectionMarks = section.questions.reduce((secSum, q) => secSum + (q.marks || 0), 0);
          return sum + sectionMarks;
        }, 0);
      } else if (questionDetails) {
        totalMarks = questionDetails.reduce((sum, q) => sum + (q.marks || 0), 0);
      }
    }
    
    // Build section overview for sectional tests
    let sectionOverview = null;
    if (test.hasSections && test.sections) {
      sectionOverview = test.sections.map((section, index) => ({
        sectionIndex: index,
        title: section.title,
        duration: section.duration,
        questionsCount: section.questions?.length || 0,
        marksTotal: section.questions?.reduce((sum, qId) => sum + 1, 0) || 0 // Adjust based on your marking
      }));
    }
    
    const response = {
      success: true,
      test: {
        // Basic Info
        _id: test._id,
        title: test.title,
        description: test.description,
        
        // Test Configuration
        testType: test.testType,
        hasSections: test.hasSections,
        scheduleType: test.scheduleType,
        recurrence: test.recurrence,
        
        // Duration & Marks
        duration: totalDuration,
        totalMarks: totalMarks,
        negativeMarks: test.negativeMarks,
        totalQuestions: totalQuestions,
        
        // Section Details (for sectional tests)
        sectionsCount: test.sections?.length || 0,
        sectionOverview: sectionOverview,
        
        // Subject/Topic Info
        subject: test.subject,
        topic: test.topic,
        subjects: test.subjects,
        
        // Test Settings
        maxAttempts: test.maxAttempts,
        allowResume: test.allowResume,
        shuffleQuestions: test.shuffleQuestions,
        showResultImmediately: test.showResultImmediately,
        isFeatured: test.isFeatured,
        
        // Time Frame
        startTime: test.startTime,
        endTime: test.endTime,
        
        // Metadata
        isPublished: test.isPublished,
        isTemplate: test.isTemplate,
        createdBy: test.createdBy,
        createdAt: test.createdAt,
        updatedAt: test.updatedAt,
        
        // Questions (populated)
        
      },
      attemptInfo: attemptInfo
    };
    
    // Add warning messages if needed
    if (test.startTime && new Date(test.startTime) > new Date()) {
      response.warning = "This test hasn't started yet";
    } else if (test.endTime && new Date(test.endTime) < new Date()) {
      response.warning = "This test has ended";
    }
    
    return res.status(200).json(response);
    
  } catch (error) {
    console.error("Get test details error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching test details",
      error: error.message
    });
  }
};
module.exports = {
  createTest,
  addQuestionsToTest,
  addQuestionsToTestBatch,
  removeQuestionsFromTest,
  reorderQuestions,
  getTestQuestions,
  getTests,
  getTestById,
  getAllTemplates,
  getAllTests,
  getTestDetails,
  // old endpoints (need refactoring)
  getTestsByTopicAndSubject,
  getTestsBySubject,
  getAttemptsByTest,
  getFullLengthTests,
  getFullLengthTestById,
  getFeaturedFullLengthTests,
  getTestFilterOptions,
  deleteTestById,
};
