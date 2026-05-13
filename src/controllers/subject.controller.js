const subjectModel = require("../models/subject.model");
const Category = require("../models/category.model");
const Topic = require("../models/topic.model");
const Test = require("../models/Test");
const Question = require("../models/Question");

// @desc    Create a new subject (with category)
// @route   POST /api/subjects
// @access  Private/Admin
const createSubject = async (req, res) => {
  try {
    const { name, description, imageUrl, category, order, difficultyLevel, examMapping } = req.body;

    // Check if category exists
    if (category) {
      const categoryExists = await Category.findById(category);
      if (!categoryExists) {
        return res.status(400).json({
          success: false,
          message: "Category not found"
        });
      }
    }

    // Check if subject already exists in the same category
    const existingSubject = await subjectModel.findOne({ 
      name, 
      category: category || null 
    });
    
    if (existingSubject) {
      return res.status(400).json({
        success: false,
        message: "Subject with this name already exists in the specified category"
      });
    }

    const subject = await subjectModel.create({
      name,
      description,
      imageUrl,
      category: category || null,
      order: order || 0,
      difficultyLevel: difficultyLevel || 'Beginner',
      examMapping: examMapping || [],
      isActive: true
    });

    // Populate category details
    const populatedSubject = await subjectModel.findById(subject._id).populate('category', 'name icon colorCode');

    res.status(201).json({
      success: true,
      data: populatedSubject,
      message: "Subject created successfully"
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

// @desc    Search subjects
// @route   GET /api/subjects/search
// @access  Public
const searchSubjects = async (req, res) => {
  try {
    const { search, category, exam } = req.query;

    let query = { isActive: true };

    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    if (category) {
      query.category = category;
    }

    if (exam) {
      query["examMapping.exam"] = exam;
    }

    const subjects = await subjectModel.find(query)
      .populate('category', 'name icon colorCode')
      .sort({ order: 1, name: 1 });

    res.status(200).json({
      success: true,
      count: subjects.length,
      data: subjects
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

// @desc    Get all subjects
// @route   GET /api/subjects
// @access  Public
const getAllSubjects = async (req, res) => {
  try {
    const { category, exam, isActive, sortBy = "order", sortOrder = "asc" } = req.query;

    let query = {};
    
    if (category) {
      query.category = category;
    }
    
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    } else {
      query.isActive = true; // Default to only active subjects
    }
    
    if (exam) {
      query["examMapping.exam"] = exam;
    }

    // Sorting
    let sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    const subjects = await subjectModel.find(query)
      .populate('category', 'name icon colorCode description')
      .sort(sort);

    res.status(200).json({
      success: true,
      count: subjects.length,
      data: subjects
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

// @desc    Get all subjects with details (for admin dashboard)
// @route   GET /api/subjects/admin/details
// @access  Private/Admin
const getAllSubjectsWithDetails = async (req, res) => {
  try {
    const subjects = await subjectModel.find()
      .populate('category', 'name icon colorCode')
      .sort({ order: 1, name: 1 });

    // Get total tests, questions, and topics for each subject
    const subjectsWithDetails = await Promise.all(subjects.map(async (subject) => {
      const testCount = await Test.countDocuments({ 
        subject: subject._id, 
        isPublished: true 
      });
      
      const questionCount = await Question.countDocuments({ 
        subject: subject._id 
      });
      
      const topicCount = await Topic.countDocuments({ 
        subject: subject._id,
        isActive: true 
      });

      // Get active tests count (current/running)
      const activeTestCount = await Test.countDocuments({
        subject: subject._id,
        isPublished: true,
        startTime: { $lte: new Date() },
        endTime: { $gte: new Date() }
      });

      return {
        ...subject.toObject(),
        testCount,
        questionCount,
        topicCount,
        activeTestCount
      };
    }));

    res.status(200).json({
      success: true,
      count: subjectsWithDetails.length,
      data: subjectsWithDetails
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

// @desc    Get subject by ID
// @route   GET /api/subjects/:id
// @access  Public
const getSubjectById = async (req, res) => {
  try {
    const subject = await subjectModel.findById(req.params.id)
      .populate('category', 'name icon colorCode description');

    if (!subject) {
      return res.status(404).json({
        success: false,
        message: "Subject not found"
      });
    }

    // Get related counts
    const topicCount = await Topic.countDocuments({ 
      subject: subject._id, 
      isActive: true 
    });
    
    const testCount = await Test.countDocuments({ 
      subject: subject._id,
      isPublished: true 
    });
    
    const questionCount = await Question.countDocuments({ 
      subject: subject._id 
    });

    res.status(200).json({
      success: true,
      data: {
        ...subject.toObject(),
        topicCount,
        testCount,
        questionCount
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching subject",
      error: error.message
    });
  }
};

// @desc    Update subject
// @route   PUT /api/subjects/:id
// @access  Private/Admin
const updateSubject = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      name, 
      description, 
      imageUrl, 
      category, 
      order, 
      difficultyLevel, 
      examMapping, 
      isActive 
    } = req.body;

    // Check if subject exists
    const subject = await subjectModel.findById(id);
    if (!subject) {
      return res.status(404).json({
        success: false,
        message: "Subject not found"
      });
    }

    // Check if new category exists
    if (category && category !== subject.category?.toString()) {
      const categoryExists = await Category.findById(category);
      if (!categoryExists) {
        return res.status(400).json({
          success: false,
          message: "Category not found"
        });
      }
    }

    // Check for duplicate name in the same category
    if (name && name !== subject.name) {
      const existingSubject = await subjectModel.findOne({
        name,
        category: category || subject.category,
        _id: { $ne: id }
      });
      
      if (existingSubject) {
        return res.status(400).json({
          success: false,
          message: "Subject with this name already exists in the specified category"
        });
      }
    }

    // Update subject
    const updatedSubject = await subjectModel.findByIdAndUpdate(
      id,
      {
        name: name || subject.name,
        description: description !== undefined ? description : subject.description,
        imageUrl: imageUrl !== undefined ? imageUrl : subject.imageUrl,
        category: category !== undefined ? category : subject.category,
        order: order !== undefined ? order : subject.order,
        difficultyLevel: difficultyLevel || subject.difficultyLevel,
        examMapping: examMapping || subject.examMapping,
        isActive: isActive !== undefined ? isActive : subject.isActive
      },
      { new: true, runValidators: true }
    ).populate('category', 'name icon colorCode');

    // If subject is deactivated, also deactivate all its topics
    if (isActive === false && subject.isActive === true) {
      await Topic.updateMany(
        { subject: subject._id },
        { isActive: false }
      );
    }

    // If subject is reactivated, optionally reactivate topics (based on requirement)
    if (isActive === true && subject.isActive === false) {
      // You might want to keep topics deactivated or reactivate them
      // await Topic.updateMany(
      //   { subject: subject._id },
      //   { isActive: true }
      // );
    }

    res.status(200).json({
      success: true,
      data: updatedSubject,
      message: "Subject updated successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating subject",
      error: error.message
    });
  }
};

// @desc    Delete subject (soft or hard delete)
// @route   DELETE /api/subjects/:id
// @access  Private/Admin
const deleteSubject = async (req, res) => {
  try {
    const { id } = req.params;
    const { hardDelete = false } = req.query;

    // Check if subject exists
    const subject = await subjectModel.findById(id);
    if (!subject) {
      return res.status(404).json({
        success: false,
        message: "Subject not found"
      });
    }

    // Check if subject has related data
    const topicCount = await Topic.countDocuments({ subject: id });
    const testCount = await Test.countDocuments({ subject: id });
    const questionCount = await Question.countDocuments({ subject: id });

    if ((topicCount > 0 || testCount > 0 || questionCount > 0) && hardDelete === false) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete subject. It has ${topicCount} topics, ${testCount} tests, and ${questionCount} questions. Use soft delete or remove related data first.`,
        stats: { topicCount, testCount, questionCount }
      });
    }

    if (hardDelete === 'true') {
      // Hard delete - remove subject and all related data
      await Topic.deleteMany({ subject: id });
      await Test.deleteMany({ subject: id });
      await Question.deleteMany({ subject: id });
      await subjectModel.findByIdAndDelete(id);
      
      res.status(200).json({
        success: true,
        message: "Subject and all associated topics, tests, and questions deleted permanently",
        deletedData: { topicCount, testCount, questionCount }
      });
    } else {
      // Soft delete - just mark as inactive
      await subjectModel.findByIdAndUpdate(id, { isActive: false });
      
      // Also soft delete all topics under this subject
      await Topic.updateMany(
        { subject: id },
        { isActive: false }
      );
      
      res.status(200).json({
        success: true,
        message: "Subject and all associated topics deactivated successfully",
        deactivatedData: { topicCount }
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error deleting subject",
      error: error.message
    });
  }
};

// @desc    Bulk update subjects status
// @route   PATCH /api/subjects/bulk/status
// @access  Private/Admin
const bulkUpdateSubjectStatus = async (req, res) => {
  try {
    const { subjectIds, isActive } = req.body;

    if (!subjectIds || !Array.isArray(subjectIds) || subjectIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide subjectIds array"
      });
    }

    const result = await subjectModel.updateMany(
      { _id: { $in: subjectIds } },
      { isActive }
    );

    // Update topics status for these subjects
    if (isActive === false) {
      await Topic.updateMany(
        { subject: { $in: subjectIds } },
        { isActive: false }
      );
    }

    res.status(200).json({
      success: true,
      message: `${result.modifiedCount} subjects updated successfully`,
      data: {
        modifiedCount: result.modifiedCount,
        isActive
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating subjects",
      error: error.message
    });
  }
};

// @desc    Get subjects by category
// @route   GET /api/subjects/category/:categoryId
// @access  Public
const getSubjectsByCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { exam, includeTopics = false } = req.query;

    // Check if category exists
    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found"
      });
    }

    let query = { 
      category: categoryId, 
      isActive: true 
    };
    
    if (exam) {
      query["examMapping.exam"] = exam;
    }

    const subjects = await subjectModel.find(query)
      .populate('category', 'name icon colorCode')
      .sort({ order: 1, name: 1 });

    let subjectsWithDetails = await Promise.all(
      subjects.map(async (subject) => {
        let topicQuery = { subject: subject._id, isActive: true };
        
        if (exam) {
          topicQuery["examSpecific.exam"] = exam;
        }

        const topicCount = await Topic.countDocuments(topicQuery);
        
        let topics = [];
        if (includeTopics === 'true') {
          topics = await Topic.find(topicQuery)
            .select('name order difficultyLevel')
            .sort({ order: 1 });
        }

        return {
          ...subject.toObject(),
          topicCount,
          ...(includeTopics === 'true' && { topics })
        };
      })
    );

    res.status(200).json({
      success: true,
      category: {
        _id: category._id,
        name: category.name,
        icon: category.icon,
        colorCode: category.colorCode
      },
      count: subjectsWithDetails.length,
      data: subjectsWithDetails
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching subjects by category",
      error: error.message
    });
  }
};

// @desc    Reorder subjects
// @route   PUT /api/subjects/reorder
// @access  Private/Admin
const reorderSubjects = async (req, res) => {
  try {
    const { subjects } = req.body; // [{ id, order }]

    if (!subjects || !Array.isArray(subjects)) {
      return res.status(400).json({
        success: false,
        message: "Please provide subjects array with id and order"
      });
    }

    const bulkOps = subjects.map(subject => ({
      updateOne: {
        filter: { _id: subject.id },
        update: { order: subject.order }
      }
    }));

    const result = await subjectModel.bulkWrite(bulkOps);

    res.status(200).json({
      success: true,
      message: "Subjects reordered successfully",
      data: {
        modifiedCount: result.modifiedCount
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error reordering subjects",
      error: error.message
    });
  }
};

// @desc    Get subject statistics
// @route   GET /api/subjects/:id/statistics
// @access  Private/Admin
const getSubjectStatistics = async (req, res) => {
  try {
    const { id } = req.params;

    const subject = await subjectModel.findById(id);
    if (!subject) {
      return res.status(404).json({
        success: false,
        message: "Subject not found"
      });
    }

    const [
      totalTopics,
      activeTopics,
      totalTests,
      activeTests,
      totalQuestions,
      publishedTests,
      upcomingTests
    ] = await Promise.all([
      Topic.countDocuments({ subject: id }),
      Topic.countDocuments({ subject: id, isActive: true }),
      Test.countDocuments({ subject: id }),
      Test.countDocuments({ 
        subject: id, 
        isPublished: true,
        startTime: { $lte: new Date() },
        endTime: { $gte: new Date() }
      }),
      Question.countDocuments({ subject: id }),
      Test.countDocuments({ subject: id, isPublished: true }),
      Test.countDocuments({
        subject: id,
        isPublished: true,
        startTime: { $gt: new Date() }
      })
    ]);

    res.status(200).json({
      success: true,
      data: {
        subject: {
          _id: subject._id,
          name: subject.name
        },
        statistics: {
          totalTopics,
          activeTopics,
          totalTests,
          activeTests,
          totalQuestions,
          publishedTests,
          upcomingTests,
          completionRate: totalTopics > 0 ? (activeTopics / totalTopics) * 100 : 0
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching subject statistics",
      error: error.message
    });
  }
};

module.exports = {
  createSubject,
  searchSubjects,
  getAllSubjects,
  getAllSubjectsWithDetails,
  getSubjectById,
  updateSubject,
  deleteSubject,
  bulkUpdateSubjectStatus,
  getSubjectsByCategory,
  reorderSubjects,
  getSubjectStatistics
};