const topicModel = require("../models/topic.model");
const subjectModel = require("../models/subject.model");
const noteModel = require("../models/note.model"); // Import note model for cascade operations

const createTopic = async (req, res) => {
    try {
        const { 
            name, 
            subjectId, 
            summary, 
            imageUrl, 
            order, 
            readTime,
            isActive 
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
        
        const topic = await topicModel.create({
            name,
            subject: subject._id,
            summary: summary || "",
            imageUrl: imageUrl || null,
            order: order || 0,
            readTime: readTime || null,
            isActive: isActive !== undefined ? isActive : true
        });

        res.status(201).json({
            success: true,
            data: topic
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

const searchTopics = async (req, res) => {
    try {
        const { search, subject, isActive } = req.query;

        let query = {};

        if (search) {
            query.name = { $regex: search, $options: "i" };
        }

        if (subject) {
            query.subject = subject;
        }

        if (isActive !== undefined) {
            query.isActive = isActive === 'true';
        }

        const topics = await topicModel.find(query)
            .populate("subject", "name description imageUrl")
            .sort({ order: 1, createdAt: 1 });

        // For each topic, get the note count
        const topicsWithNoteCount = await Promise.all(topics.map(async (topic) => {
            const noteCount = await noteModel.countDocuments({ topic: topic._id });
            return {
                ...topic.toObject(),
                noteCount
            };
        }));

        res.status(200).json({
            success: true,
            count: topics.length,
            data: topicsWithNoteCount
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

const getTopicsBySubject = async (req, res) => {
    try {
        const { subjectId } = req.params;
        const { includeInactive } = req.query;

        let query = { subject: subjectId };
        
        // Only show active topics unless includeInactive is true
        if (includeInactive !== 'true') {
            query.isActive = true;
        }

        const topics = await topicModel
            .find(query)
            .sort({ order: 1, createdAt: 1 });

        // Get note count for each topic
        const topicsWithNoteCount = await Promise.all(topics.map(async (topic) => {
            const noteCount = await noteModel.countDocuments({ 
                topic: topic._id,
                isPublished: true 
            });
            return {
                ...topic.toObject(),
                noteCount
            };
        }));

        res.status(200).json({
            success: true,
            count: topics.length,
            data: topicsWithNoteCount
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

const getTopicDetails = async (req, res) => {
    try {
        const { topicId } = req.params;
        const { includeNotes } = req.query;

        // Find topic by ID and populate subject details
        const topic = await topicModel
            .findById(topicId)
            .populate("subject", "name description imageUrl");

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

        const noteCount = await noteModel.countDocuments({ topic: topicId });

        res.status(200).json({
            success: true,
            data: {
                ...topic.toObject(),
                noteCount,
                notes: notes || undefined
            }
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

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
        }

        // Update topic with new data
        const updatedTopic = await topicModel.findByIdAndUpdate(
            topicId,
            updateData,
            { 
                new: true,
                runValidators: true
            }
        ).populate("subject", "name description");

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
        }

        // Update only provided fields
        const allowedFields = ['name', 'subject', 'isActive', 'imageUrl', 'summary', 'order', 'readTime'];
        allowedFields.forEach(key => {
            if (updateData[key] !== undefined) {
                existingTopic[key] = updateData[key];
            }
        });

        await existingTopic.save();

        res.status(200).json({
            success: true,
            message: "Topic updated successfully",
            data: existingTopic
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

const deleteTopic = async (req, res) => {
    try {
        const { topicId } = req.params;
        const { cascadeDeleteNotes } = req.query;

        const topic = await topicModel.findById(topicId);
        
        if (!topic) {
            return res.status(404).json({
                success: false,
                message: "Topic not found"
            });
        }

        // Check if topic has associated notes
        const noteCount = await noteModel.countDocuments({ topic: topicId });

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

        // Delete the topic
        await topicModel.findByIdAndDelete(topicId);

        res.status(200).json({
            success: true,
            message: cascadeDeleteNotes === 'true' && noteCount > 0 
                ? `Topic and ${noteCount} associated notes deleted successfully`
                : "Topic deleted successfully",
            data: {
                deletedTopic: topic,
                deletedNotesCount: cascadeDeleteNotes === 'true' ? noteCount : 0
            }
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

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

const getTopicsWithPagination = async (req, res) => {
    try {
        const { subjectId } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        const { includeInactive, search } = req.query;

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

        const topics = await topicModel
            .find(query)
            .sort({ order: 1, createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate("subject", "name");

        // Get note counts for each topic
        const topicsWithDetails = await Promise.all(topics.map(async (topic) => {
            const noteCount = await noteModel.countDocuments({ 
                topic: topic._id,
                isPublished: true 
            });
            return {
                ...topic.toObject(),
                noteCount
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
                itemsPerPage: limit
            }
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

// New: Get topic statistics
const getTopicStatistics = async (req, res) => {
    try {
        const { topicId } = req.params;

        const topic = await topicModel.findById(topicId);
        if (!topic) {
            return res.status(404).json({
                success: false,
                message: "Topic not found"
            });
        }

        const totalNotes = await noteModel.countDocuments({ topic: topicId });
        const publishedNotes = await noteModel.countDocuments({ topic: topicId, isPublished: true });
        const totalVersions = await noteModel.aggregate([
            { $match: { topic: topic._id } },
            { $group: { _id: null, total: { $sum: "$version" } } }
        ]);

        res.status(200).json({
            success: true,
            data: {
                topicId: topic._id,
                topicName: topic.name,
                totalNotes,
                publishedNotes,
                draftNotes: totalNotes - publishedNotes,
                totalVersions: totalVersions[0]?.total || 0
            }
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
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
    getTopicStatistics  // New exported function
};