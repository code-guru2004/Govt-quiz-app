const Category = require("../models/category.model");
const Subject = require("../models/subject.model");
const Topic = require("../models/topic.model");

// @desc    Create a new category
// @route   POST /api/categories
// @access  Private/Admin
exports.createCategory = async (req, res) => {
  try {
    const { name, description, imageUrl, order, icon, colorCode } = req.body;

    // Check if category already exists
    const existingCategory = await Category.findOne({ name });
    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: "Category with this name already exists"
      });
    }

    const category = await Category.create({
      name,
      description,
      imageUrl,
      order: order || 0,
      icon: icon || "",
      colorCode: colorCode || "#3B82F6",
      isActive: true
    });

    res.status(201).json({
      success: true,
      data: category,
      message: "Category created successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error creating category",
      error: error.message
    });
  }
};

// @desc    Get all categories with their subjects
// @route   GET /api/categories
// @access  Public
exports.getAllCategories = async (req, res) => {
  try {
    const { includeInactive = false, exam } = req.query;

    // Build query
    let query = {};
    if (!includeInactive) {
      query.isActive = true;
    }

    const categories = await Category.find(query).sort({ order: 1, name: 1 });

    // Get subjects for each category
    const categoriesWithSubjects = await Promise.all(
      categories.map(async (category) => {
        let subjectQuery = { category: category._id, isActive: true };
        
        // Filter by exam if specified
        if (exam) {
          subjectQuery = {
            ...subjectQuery,
            "examMapping.exam": exam
          };
        }

        const subjects = await Subject.find(subjectQuery)
          .sort({ order: 1, name: 1 })
          .select("-__v");

        // Get topics count for each subject
        const subjectsWithCount = await Promise.all(
          subjects.map(async (subject) => {
            const topicCount = await Topic.countDocuments({
              subject: subject._id,
              isActive: true
            });
            
            return {
              ...subject.toObject(),
              topicCount
            };
          })
        );

        return {
          ...category.toObject(),
          subjects: subjectsWithCount,
          totalSubjects: subjectsWithCount.length
        };
      })
    );

    res.status(200).json({
      success: true,
      count: categoriesWithSubjects.length,
      data: categoriesWithSubjects
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching categories",
      error: error.message
    });
  }
};

// @desc    Get single category with its subjects and topics
// @route   GET /api/categories/:id
// @access  Public
exports.getCategoryById = async (req, res) => {
  try {
    const { id } = req.params;
    const { includeTopics = false, exam } = req.query;

    const category = await Category.findById(id);
    
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found"
      });
    }

    // Build subject query
    let subjectQuery = { category: category._id, isActive: true };
    if (exam) {
      subjectQuery["examMapping.exam"] = exam;
    }

    const subjects = await Subject.find(subjectQuery)
      .sort({ order: 1, name: 1 });

    let subjectsWithDetails = await Promise.all(
      subjects.map(async (subject) => {
        let topicQuery = { subject: subject._id, isActive: true };
        
        if (exam) {
          topicQuery["examSpecific.exam"] = exam;
        }

        let topics = [];
        if (includeTopics) {
          topics = await Topic.find(topicQuery)
            .sort({ order: 1, name: 1 })
            .select("-__v");
        }

        const topicCount = await Topic.countDocuments(topicQuery);

        return {
          ...subject.toObject(),
          topicCount,
          ...(includeTopics && { topics })
        };
      })
    );

    res.status(200).json({
      success: true,
      data: {
        ...category.toObject(),
        subjects: subjectsWithDetails,
        totalSubjects: subjectsWithDetails.length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching category",
      error: error.message
    });
  }
};

// @desc    Update category
// @route   PUT /api/categories/:id
// @access  Private/Admin
exports.updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, imageUrl, isActive, order, icon, colorCode } = req.body;

    // Check if category exists
    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found"
      });
    }

    // Check for duplicate name if name is being changed
    if (name && name !== category.name) {
      const existingCategory = await Category.findOne({ name });
      if (existingCategory) {
        return res.status(400).json({
          success: false,
          message: "Category with this name already exists"
        });
      }
    }

    const updatedCategory = await Category.findByIdAndUpdate(
      id,
      {
        name: name || category.name,
        description: description !== undefined ? description : category.description,
        imageUrl: imageUrl !== undefined ? imageUrl : category.imageUrl,
        isActive: isActive !== undefined ? isActive : category.isActive,
        order: order !== undefined ? order : category.order,
        icon: icon !== undefined ? icon : category.icon,
        colorCode: colorCode !== undefined ? colorCode : category.colorCode
      },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      data: updatedCategory,
      message: "Category updated successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating category",
      error: error.message
    });
  }
};

// @desc    Delete category (soft delete or hard delete)
// @route   DELETE /api/categories/:id
// @access  Private/Admin
exports.deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { hardDelete = false } = req.query;

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found"
      });
    }

    // Check if category has subjects
    const subjectCount = await Subject.countDocuments({ category: id });
    
    if (subjectCount > 0 && hardDelete === false) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete category. It has ${subjectCount} subjects associated. Use soft delete or reassign subjects first.`,
        subjectCount
      });
    }

    if (hardDelete === 'true') {
      // Hard delete - remove all associated subjects and topics
      const subjects = await Subject.find({ category: id });
      
      for (const subject of subjects) {
        await Topic.deleteMany({ subject: subject._id });
      }
      await Subject.deleteMany({ category: id });
      await Category.findByIdAndDelete(id);
      
      res.status(200).json({
        success: true,
        message: "Category and all associated subjects/topics deleted permanently"
      });
    } else {
      // Soft delete - just mark as inactive
      await Category.findByIdAndUpdate(id, { isActive: false });
      
      // Also soft delete all subjects under this category
      await Subject.updateMany(
        { category: id },
        { isActive: false }
      );
      
      // Soft delete all topics under these subjects
      const subjects = await Subject.find({ category: id });
      const subjectIds = subjects.map(s => s._id);
      await Topic.updateMany(
        { subject: { $in: subjectIds } },
        { isActive: false }
      );
      
      res.status(200).json({
        success: true,
        message: "Category and all associated subjects/topics deactivated successfully"
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error deleting category",
      error: error.message
    });
  }
};

// @desc    Get category hierarchy with pagination
// @route   GET /api/categories/hierarchy
// @access  Public
exports.getCategoryHierarchy = async (req, res) => {
  try {
    const { 
      exam, 
      page = 1, 
      limit = 10,
      includeTopics = false,
      search 
    } = req.query;

    const skip = (page - 1) * limit;

    // Build category query
    let categoryQuery = { isActive: true };
    if (search) {
      categoryQuery.name = { $regex: search, $options: 'i' };
    }

    const categories = await Category.find(categoryQuery)
      .sort({ order: 1, name: 1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalCategories = await Category.countDocuments(categoryQuery);

    // Build full hierarchy
    const hierarchy = await Promise.all(
      categories.map(async (category) => {
        let subjectQuery = { category: category._id, isActive: true };
        if (exam) {
          subjectQuery["examMapping.exam"] = exam;
        }

        const subjects = await Subject.find(subjectQuery)
          .sort({ order: 1, name: 1 });

        const subjectsWithTopics = await Promise.all(
          subjects.map(async (subject) => {
            let topicQuery = { subject: subject._id, isActive: true };
            if (exam) {
              topicQuery["examSpecific.exam"] = exam;
            }

            let topics = [];
            if (includeTopics === 'true') {
              topics = await Topic.find(topicQuery)
                .sort({ order: 1, name: 1 })
                .select("name order difficultyLevel examSpecific");
            }

            const topicCount = await Topic.countDocuments(topicQuery);

            return {
              _id: subject._id,
              name: subject.name,
              description: subject.description,
              order: subject.order,
              difficultyLevel: subject.difficultyLevel,
              topicCount,
              ...(includeTopics === 'true' && { topics })
            };
          })
        );

        return {
          _id: category._id,
          name: category.name,
          description: category.description,
          icon: category.icon,
          colorCode: category.colorCode,
          order: category.order,
          totalSubjects: subjectsWithTopics.length,
          subjects: subjectsWithTopics
        };
      })
    );

    res.status(200).json({
      success: true,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCategories,
        totalPages: Math.ceil(totalCategories / limit)
      },
      data: hierarchy
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching category hierarchy",
      error: error.message
    });
  }
};

// @desc    Get subjects by category with advanced filtering
// @route   GET /api/categories/:id/subjects
// @access  Public
exports.getCategorySubjects = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      exam, 
      difficulty, 
      search,
      page = 1,
      limit = 20,
      sortBy = "order",
      sortOrder = "asc"
    } = req.query;

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found"
      });
    }

    // Build query
    let query = { category: id, isActive: true };
    
    if (exam) {
      query["examMapping.exam"] = exam;
    }
    
    if (difficulty) {
      query.difficultyLevel = difficulty;
    }
    
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }

    // Sorting
    let sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    const skip = (page - 1) * limit;

    const subjects = await Subject.find(query)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('category', 'name colorCode');

    const totalSubjects = await Subject.countDocuments(query);

    // Get topic counts for each subject
    const subjectsWithDetails = await Promise.all(
      subjects.map(async (subject) => {
        const topicCount = await Topic.countDocuments({
          subject: subject._id,
          isActive: true
        });

        // Get high importance topics count for exams
        let highImportanceTopics = 0;
        if (exam) {
          highImportanceTopics = await Topic.countDocuments({
            subject: subject._id,
            isActive: true,
            "examSpecific.exam": exam,
            "examSpecific.importance": { $in: ["High", "Critical"] }
          });
        }

        return {
          ...subject.toObject(),
          topicCount,
          highImportanceTopics,
          password: undefined // Remove if any sensitive fields
        };
      })
    );

    res.status(200).json({
      success: true,
      category: {
        _id: category._id,
        name: category.name,
        icon: category.icon
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalSubjects,
        totalPages: Math.ceil(totalSubjects / limit)
      },
      data: subjectsWithDetails
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching category subjects",
      error: error.message
    });
  }
};

// @desc    Bulk update category status
// @route   PATCH /api/categories/bulk/status
// @access  Private/Admin
exports.bulkUpdateCategoryStatus = async (req, res) => {
  try {
    const { categoryIds, isActive } = req.body;

    if (!categoryIds || !Array.isArray(categoryIds) || categoryIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide categoryIds array"
      });
    }

    const result = await Category.updateMany(
      { _id: { $in: categoryIds } },
      { isActive }
    );

    res.status(200).json({
      success: true,
      message: `${result.modifiedCount} categories updated successfully`,
      data: {
        modifiedCount: result.modifiedCount,
        isActive
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating categories",
      error: error.message
    });
  }
};

// @desc    Reorder categories
// @route   PUT /api/categories/reorder
// @access  Private/Admin
exports.reorderCategories = async (req, res) => {
  try {
    const { categories } = req.body; // [{ id, order }]

    if (!categories || !Array.isArray(categories)) {
      return res.status(400).json({
        success: false,
        message: "Please provide categories array with id and order"
      });
    }

    const bulkOps = categories.map(cat => ({
      updateOne: {
        filter: { _id: cat.id },
        update: { order: cat.order }
      }
    }));

    const result = await Category.bulkWrite(bulkOps);

    res.status(200).json({
      success: true,
      message: "Categories reordered successfully",
      data: {
        modifiedCount: result.modifiedCount
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error reordering categories",
      error: error.message
    });
  }
};