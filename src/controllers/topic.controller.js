const topicModel = require("../models/topic.model");
const subjectModel = require("../models/subject.model");
const categoryModel = require("../models/category.model");
const noteModel = require("../models/note.model"); // Import note model for cascade operations

// @desc    Create a new topic
// @route   POST /api/topics/create
// @access  Private/Admin
const createTopic = async (req, res) => {
    try {
        const { 
            name, 
            subjectId, 
            summary, 
            imageUrl, 
            order, 
            readTime,
            isActive,
            importanceLevel,
            prerequisites,
            examSpecific,
            tags,
            metadata
        } = req.body;
        
        // Basic validation
        if (!name || !subjectId) {
            return res.status(400).json({   
                success: false,
                message: "Name and subjectId are required"
            });
        }

        // Check if subject exists
        const subject = await subjectModel.findById(subjectId);
        if (!subject) {
            return res.status(404).json({
                success: false,
                message: "Subject not found"
            });
        }
        
        // Get category from subject
        const category = subject.category;
        
        const topic = await topicModel.create({
            name,
            subject: subject._id,
            category: category || null,
            summary: summary || "",
            imageUrl: imageUrl || null,
            order: order || 0,
            readTime: readTime || null,
            isActive: isActive !== undefined ? isActive : true,
            importanceLevel: importanceLevel || "High",
            prerequisites: prerequisites || [],
            examSpecific: examSpecific || [],
            tags: tags || [],
            metadata: metadata || {
                totalQuestions: 0,
                averageTimePerQuestion: null,
                successRate: null
            }
        });

        // Populate subject and category details
        const populatedTopic = await topicModel.findById(topic._id)
            .populate("subject", "name description imageUrl category")
            .populate("category", "name icon colorCode")
            .populate("prerequisites", "name");

        res.status(201).json({
            success: true,
            data: populatedTopic,
            message: "Topic created successfully"
        });
    } catch (err) {
        // Handle duplicate key error
        if (err.code === 11000) {
            return res.status(400).json({
                success: false,
                message: "A topic with this name already exists under the same subject"
            });
        }
        res.status(500).json({
            success: false, 
            message: err.message
        });
    }
};

// @desc    Search topics with advanced filtering
// @route   GET /api/topics/search
// @access  Private (Authenticated)
const searchTopics = async (req, res) => {
    try {
        const { 
            search, 
            subject, 
            category,
            isActive,
            importanceLevel,
            exam,
            tag,
            minWeightage,
            sortBy = "order",
            sortOrder = "asc"
        } = req.query;

        let query = {};

        if (search) {
            query.name = { $regex: search, $options: "i" };
        }

        if (subject) {
            query.subject = subject;
        }

        if (category) {
            query.category = category;
        }

        if (isActive !== undefined) {
            query.isActive = isActive === 'true';
        }

        if (importanceLevel) {
            query.importanceLevel = importanceLevel;
        }

        if (exam) {
            query["examSpecific.exam"] = exam;
        }

        if (tag) {
            query.tags = tag;
        }

        if (minWeightage) {
            query["examSpecific.weightage"] = { $gte: parseInt(minWeightage) };
        }

        // Sorting
        let sort = {};
        sort[sortBy] = sortOrder === "desc" ? -1 : 1;

        const topics = await topicModel.find(query)
            .populate("subject", "name description imageUrl category")
            .populate("category", "name icon colorCode")
            .populate("prerequisites", "name importanceLevel")
            .sort(sort);

        // For each topic, get the note count and filter examSpecific if exam is provided
        const topicsWithDetails = await Promise.all(topics.map(async (topic) => {
            const noteCount = await noteModel.countDocuments({ 
                topic: topic._id,
                isPublished: true 
            });
            
            let examSpecificData = topic.examSpecific;
            if (exam) {
                examSpecificData = topic.examSpecific.filter(e => e.exam === exam);
            }
            
            return {
                ...topic.toObject(),
                noteCount,
                examSpecific: examSpecificData
            };
        }));

        res.status(200).json({
            success: true,
            count: topics.length,
            data: topicsWithDetails
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

// @desc    Get topics by subject
// @route   GET /api/topics/subject/:subjectId
// @access  Private (Authenticated)
const getTopicsBySubject = async (req, res) => {
    try {
        const { subjectId } = req.params;
        const { 
            includeInactive, 
            exam,
            importanceLevel,
            sortBy = "order",
            sortOrder = "asc"
        } = req.query;

        // Check if subject exists
        const subject = await subjectModel.findById(subjectId).populate("category");
        if (!subject) {
            return res.status(404).json({
                success: false,
                message: "Subject not found"
            });
        }

        let query = { subject: subjectId };
        
        // Only show active topics unless includeInactive is true
        if (includeInactive !== 'true') {
            query.isActive = true;
        }

        if (importanceLevel) {
            query.importanceLevel = importanceLevel;
        }

        // Sorting
        let sort = {};
        sort[sortBy] = sortOrder === "desc" ? -1 : 1;

        let topics = await topicModel
            .find(query)
            .populate("prerequisites", "name importanceLevel")
            .sort(sort);

        // Filter by exam if specified
        if (exam) {
            topics = topics.filter(topic => 
                topic.examSpecific.some(e => e.exam === exam)
            );
        }

        // Get note count for each topic
        const topicsWithDetails = await Promise.all(topics.map(async (topic) => {
            const noteCount = await noteModel.countDocuments({ 
                topic: topic._id,
                isPublished: true 
            });
            
            // Filter examSpecific for the requested exam
            let examSpecificData = topic.examSpecific;
            if (exam) {
                examSpecificData = topic.examSpecific.filter(e => e.exam === exam);
            }
            
            return {
                ...topic.toObject(),
                noteCount,
                examSpecific: examSpecificData
            };
        }));

        res.status(200).json({
            success: true,
            subject: {
                _id: subject._id,
                name: subject.name,
                category: subject.category
            },
            count: topicsWithDetails.length,
            data: topicsWithDetails
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

// @desc    Get topic details by ID
// @route   GET /api/topics/:topicId
// @access  Private (Authenticated)
const getTopicDetails = async (req, res) => {
    try {
        const { topicId } = req.params;
        const { includeNotes, includePrerequisites } = req.query;

        // Find topic by ID and populate relations
        const topic = await topicModel
            .findById(topicId)
            .populate("subject", "name description imageUrl category")
            .populate("category", "name icon colorCode")
            .populate("prerequisites", "name importanceLevel summary");

        if (!topic) {
            return res.status(404).json({
                success: false,
                message: "Topic not found"
            });
        }

        // Optionally include notes for this topic
        let notes = null;
        if (includeNotes === 'true') {
            notes = await noteModel
                .find({ 
                    topic: topicId,
                    isPublished: true 
                })
                .sort({ createdAt: -1 })
                .select("title version isPublished createdAt updatedAt");
        }

        // Get prerequisite topics details if requested
        let prerequisiteTopics = null;
        if (includePrerequisites === 'true' && topic.prerequisites.length > 0) {
            prerequisiteTopics = await topicModel.find({
                _id: { $in: topic.prerequisites }
            }).select("name importanceLevel summary");
        }

        const noteCount = await noteModel.countDocuments({ 
            topic: topicId,
            isPublished: true 
        });
        
        const totalNotes = await noteModel.countDocuments({ topic: topicId });

        res.status(200).json({
            success: true,
            data: {
                ...topic.toObject(),
                noteCount,
                totalNotes,
                notes: notes || undefined,
                prerequisiteTopics: prerequisiteTopics || undefined
            }
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

// @desc    Update topic (full update)
// @route   PUT /api/topics/:topicId
// @access  Private/Admin
const updateTopic = async (req, res) => {
    try {
        const { topicId } = req.params;
        const updateData = req.body;

        // Check if topic exists
        const existingTopic = await topicModel.findById(topicId);
        if (!existingTopic) {
            return res.status(404).json({
                success: false,
                message: "Topic not found"
            });
        }

        // If subjectId is being updated, verify the new subject exists
        if (updateData.subjectId) {
            const subject = await subjectModel.findById(updateData.subjectId);
            if (!subject) {
                return res.status(404).json({
                    success: false,
                    message: "New subject not found"
                });
            }
            // Convert subjectId to subject field for the model
            updateData.subject = updateData.subjectId;
            delete updateData.subjectId;
            
            // Also update category based on new subject
            if (subject.category) {
                updateData.category = subject.category;
            }
        }

        // Validate prerequisites if provided
        if (updateData.prerequisites && updateData.prerequisites.length > 0) {
            const validPrerequisites = await topicModel.find({
                _id: { $in: updateData.prerequisites },
                isActive: true
            });
            
            if (validPrerequisites.length !== updateData.prerequisites.length) {
                return res.status(400).json({
                    success: false,
                    message: "One or more prerequisite topics are invalid or inactive"
                });
            }
        }

        // Update topic with new data
        const updatedTopic = await topicModel.findByIdAndUpdate(
            topicId,
            updateData,
            { 
                new: true,
                runValidators: true
            }
        )
        .populate("subject", "name description category")
        .populate("category", "name icon colorCode")
        .populate("prerequisites", "name importanceLevel");

        res.status(200).json({
            success: true,
            message: "Topic updated successfully",
            data: updatedTopic
        });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({
                success: false,
                message: "A topic with this name already exists under the same subject"
            });
        }
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

// @desc    Patch topic (partial update)
// @route   PATCH /api/topics/:topicId
// @access  Private/Admin
const patchTopic = async (req, res) => {
    try {
        const { topicId } = req.params;
        const updateData = req.body;

        // Check if topic exists
        const existingTopic = await topicModel.findById(topicId);
        if (!existingTopic) {
            return res.status(404).json({
                success: false,
                message: "Topic not found"
            });
        }

        // If subject is being updated, verify the new subject exists
        if (updateData.subject) {
            const subject = await subjectModel.findById(updateData.subject);
            if (!subject) {
                return res.status(404).json({
                    success: false,
                    message: "Subject not found"
                });
            }
            // Update category based on new subject
            if (subject.category) {
                updateData.category = subject.category;
            }
        }

        // Validate prerequisites if provided
        if (updateData.prerequisites) {
            const validPrerequisites = await topicModel.find({
                _id: { $in: updateData.prerequisites },
                isActive: true
            });
            
            if (validPrerequisites.length !== updateData.prerequisites.length) {
                return res.status(400).json({
                    success: false,
                    message: "One or more prerequisite topics are invalid or inactive"
                });
            }
        }

        // Update only provided fields
        const allowedFields = [
            'name', 'subject', 'category', 'isActive', 'imageUrl', 
            'summary', 'order', 'readTime', 'importanceLevel', 
            'prerequisites', 'examSpecific', 'tags', 'metadata'
        ];
        
        allowedFields.forEach(key => {
            if (updateData[key] !== undefined) {
                existingTopic[key] = updateData[key];
            }
        });

        await existingTopic.save();

        const populatedTopic = await topicModel.findById(topicId)
            .populate("subject", "name description category")
            .populate("category", "name icon colorCode")
            .populate("prerequisites", "name importanceLevel");

        res.status(200).json({
            success: true,
            message: "Topic updated successfully",
            data: populatedTopic
        });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({
                success: false,
                message: "A topic with this name already exists under the same subject"
            });
        }
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

// @desc    Delete topic (soft or hard delete)
// @route   DELETE /api/topics/:topicId
// @access  Private/Admin
const deleteTopic = async (req, res) => {
    try {
        const { topicId } = req.params;
        const { cascadeDeleteNotes, hardDelete } = req.query;

        const topic = await topicModel.findById(topicId);
        
        if (!topic) {
            return res.status(404).json({
                success: false,
                message: "Topic not found"
            });
        }

        // Check if topic has associated notes
        const noteCount = await noteModel.countDocuments({ topic: topicId });

        if (hardDelete === 'true') {
            // Hard delete - remove topic and all related data
            if (noteCount > 0 && cascadeDeleteNotes !== 'true') {
                return res.status(400).json({
                    success: false,
                    message: `This topic has ${noteCount} associated notes. Use cascadeDeleteNotes=true to delete them as well.`,
                    noteCount
                });
            }

            // Delete associated notes if cascadeDeleteNotes is true
            if (cascadeDeleteNotes === 'true' && noteCount > 0) {
                await noteModel.deleteMany({ topic: topicId });
            }

            // Remove this topic from prerequisites of other topics
            await topicModel.updateMany(
                { prerequisites: topicId },
                { $pull: { prerequisites: topicId } }
            );

            // Delete the topic
            await topicModel.findByIdAndDelete(topicId);

            res.status(200).json({
                success: true,
                message: cascadeDeleteNotes === 'true' && noteCount > 0 
                    ? `Topic and ${noteCount} associated notes deleted permanently`
                    : "Topic deleted permanently",
                data: {
                    deletedTopic: topic,
                    deletedNotesCount: cascadeDeleteNotes === 'true' ? noteCount : 0
                }
            });
        } else {
            // Soft delete - just mark as inactive
            topic.isActive = false;
            await topic.save();
            
            res.status(200).json({
                success: true,
                message: "Topic deactivated successfully",
                data: topic
            });
        }
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

// @desc    Update topics order
// @route   PUT /api/topics/order/bulk
// @access  Private/Admin
const updateTopicsOrder = async (req, res) => {
    try {
        const { topics } = req.body; // Array of { id, order }

        if (!topics || !Array.isArray(topics)) {
            return res.status(400).json({
                success: false,
                message: "Topics array is required"
            });
        }

        const updatePromises = topics.map(topic => 
            topicModel.findByIdAndUpdate(topic.id, { order: topic.order }, { new: true })
        );

        const updatedTopics = await Promise.all(updatePromises);

        res.status(200).json({
            success: true,
            message: "Topics order updated successfully",
            data: updatedTopics
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

// @desc    Get topics with pagination and filtering
// @route   GET /api/topics/subject/:subjectId/paginated
// @access  Private (Authenticated)
const getTopicsWithPagination = async (req, res) => {
    try {
        const { subjectId } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        const { 
            includeInactive, 
            search, 
            importanceLevel,
            exam,
            tag,
            sortBy = "order",
            sortOrder = "asc"
        } = req.query;

        let query = {};
        
        if (subjectId) {
            query.subject = subjectId;
        }
        
        if (includeInactive !== 'true') {
            query.isActive = true;
        }

        if (search) {
            query.name = { $regex: search, $options: "i" };
        }

        if (importanceLevel) {
            query.importanceLevel = importanceLevel;
        }

        if (tag) {
            query.tags = tag;
        }

        // Sorting
        let sort = {};
        sort[sortBy] = sortOrder === "desc" ? -1 : 1;

        let topics = await topicModel
            .find(query)
            .sort(sort)
            .skip(skip)
            .limit(limit)
            .populate("subject", "name")
            .populate("prerequisites", "name");

        // Filter by exam if specified
        if (exam) {
            topics = topics.filter(topic => 
                topic.examSpecific.some(e => e.exam === exam)
            );
        }

        // Get note counts for each topic
        const topicsWithDetails = await Promise.all(topics.map(async (topic) => {
            const noteCount = await noteModel.countDocuments({ 
                topic: topic._id,
                isPublished: true 
            });
            
            // Get exam-specific importance for display
            const examImportance = exam ? 
                topic.examSpecific.find(e => e.exam === exam)?.importance || null : null;
            
            return {
                ...topic.toObject(),
                noteCount,
                examImportance
            };
        }));

        const total = await topicModel.countDocuments(query);

        res.status(200).json({
            success: true,
            data: topicsWithDetails,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(total / limit),
                totalItems: total,
                itemsPerPage: limit,
                hasNextPage: page < Math.ceil(total / limit),
                hasPrevPage: page > 1
            }
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

// @desc    Get topic statistics
// @route   GET /api/topics/:topicId/statistics
// @access  Private/Admin
const getTopicStatistics = async (req, res) => {
    try {
        const { topicId } = req.params;

        const topic = await topicModel.findById(topicId)
            .populate("subject", "name")
            .populate("prerequisites", "name");
            
        if (!topic) {
            return res.status(404).json({
                success: false,
                message: "Topic not found"
            });
        }

        const totalNotes = await noteModel.countDocuments({ topic: topicId });
        const publishedNotes = await noteModel.countDocuments({ 
            topic: topicId, 
            isPublished: true 
        });
        
        const totalVersions = await noteModel.aggregate([
            { $match: { topic: topic._id } },
            { $group: { _id: null, total: { $sum: "$version" } } }
        ]);

        // Get topics that have this topic as prerequisite
        const usedAsPrerequisite = await topicModel.countDocuments({
            prerequisites: topicId,
            isActive: true
        });

        // Get exam distribution
        const examDistribution = topic.examSpecific.map(exam => ({
            exam: exam.exam,
            importance: exam.importance,
            weightage: exam.weightage,
            previousYearCount: exam.previousYearCount
        }));

        res.status(200).json({
            success: true,
            data: {
                topicId: topic._id,
                topicName: topic.name,
                importanceLevel: topic.importanceLevel,
                subject: topic.subject,
                totalNotes,
                publishedNotes,
                draftNotes: totalNotes - publishedNotes,
                totalVersions: totalVersions[0]?.total || 0,
                usedAsPrerequisite,
                examDistribution,
                prerequisitesCount: topic.prerequisites.length,
                tagsCount: topic.tags.length,
                isActive: topic.isActive
            }
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

// @desc    Bulk update topics status
// @route   PATCH /api/topics/bulk/status
// @access  Private/Admin
const bulkUpdateTopicsStatus = async (req, res) => {
    try {
        const { topicIds, isActive } = req.body;

        if (!topicIds || !Array.isArray(topicIds) || topicIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Please provide topicIds array"
            });
        }

        const result = await topicModel.updateMany(
            { _id: { $in: topicIds } },
            { isActive }
        );

        res.status(200).json({
            success: true,
            message: `${result.modifiedCount} topics updated successfully`,
            data: {
                modifiedCount: result.modifiedCount,
                isActive
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// @desc    Get topics by category
// @route   GET /api/topics/category/:categoryId
// @access  Private (Authenticated)
const getTopicsByCategory = async (req, res) => {
    try {
        const { categoryId } = req.params;
        const { exam, importanceLevel, includeInactive } = req.query;

        const category = await categoryModel.findById(categoryId);
        if (!category) {
            return res.status(404).json({
                success: false,
                message: "Category not found"
            });
        }

        let query = { category: categoryId };
        
        if (includeInactive !== 'true') {
            query.isActive = true;
        }
        
        if (importanceLevel) {
            query.importanceLevel = importanceLevel;
        }

        let topics = await topicModel.find(query)
            .populate("subject", "name")
            .populate("prerequisites", "name")
            .sort({ order: 1, name: 1 });

        // Filter by exam if specified
        if (exam) {
            topics = topics.filter(topic => 
                topic.examSpecific.some(e => e.exam === exam)
            );
        }

        // Group topics by subject
        const topicsBySubject = topics.reduce((acc, topic) => {
            const subjectName = topic.subject?.name || "Uncategorized";
            if (!acc[subjectName]) {
                acc[subjectName] = [];
            }
            acc[subjectName].push(topic);
            return acc;
        }, {});

        res.status(200).json({
            success: true,
            category: {
                _id: category._id,
                name: category.name
            },
            totalTopics: topics.length,
            data: topicsBySubject
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

module.exports = {
    createTopic,
    searchTopics,
    getTopicsBySubject,
    getTopicDetails,
    updateTopic,
    patchTopic,
    deleteTopic,
    updateTopicsOrder,
    getTopicsWithPagination,
    getTopicStatistics,
    bulkUpdateTopicsStatus,
    getTopicsByCategory
};