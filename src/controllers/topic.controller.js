const topicModel = require("../models/topic.model");
const subjectModel = require("../models/subject.model");

const createTopic = async (req, res) => {
    // Implementation for creating a topic
    try {
        const { name, subjectId } = req.body;
        // 🔥 Basic validation
        if (!name || !subjectId) {
            return res.status(400).json({   
                success: false,
                message: "Name and subjectId are required"
            });
        }

        // check if subject exists
        const subject = await subjectModel.findById(subjectId);
        if (!subject) {
            return res.status(404).json({
                success: false,
                message: "Subject not found"
            });
        }
        
        const topic = await topicModel.create({
            name,
            subject: subject._id
        });

        res.status(201).json({
            success: true,
            data: topic
        });
    } catch (err) {
        res.status(500).json({
            success: false, 
            message: err.message
        });
    }
};

const searchTopics = async (req, res) => {
    try {
        const { search, subject } = req.query;

        let query = {};

        if (search) {
            query.name = { $regex: search, $options: "i" };
        }

        if (subject) {
            query.subject = subject;
        }

        const topics = await topicModel.find(query)
            .populate("subject", "name")
            .sort({ createdAt: 1 });

        res.status(200).json({
            success: true,
            count: topics.length,
            data: topics
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

// get all topics for a subject
const getTopicsBySubject = async (req, res) => {
    try {
        console.log("calling....")
        const { subjectId } = req.params;

        const topics = await topicModel
            .find({ subject: subjectId })
            .sort({ createdAt: 1 });

        res.status(200).json({
            success: true,
            count: topics.length,
            data: topics
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

// Get single topic details by ID
const getTopicDetails = async (req, res) => {
    try {
        const { topicId } = req.params;

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

        res.status(200).json({
            success: true,
            data: topic
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

// Update topic by ID
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
        // This allows updating any fields: name, content, summary, importantNotes, 
        // readTime, order, isActive, imageUrl, resources
        const updatedTopic = await topicModel.findByIdAndUpdate(
            topicId,
            updateData,
            { 
                new: true,           // Return the updated document
                runValidators: true  // Run model validations
            }
        ).populate("subject", "name description");

        res.status(200).json({
            success: true,
            message: "Topic updated successfully",
            data: updatedTopic
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

// Alternative: Partial update for specific fields only
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
        Object.keys(updateData).forEach(key => {
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
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

// Delete topic
const deleteTopic = async (req, res) => {
    try {
        const { topicId } = req.params;

        const topic = await topicModel.findByIdAndDelete(topicId);
        
        if (!topic) {
            return res.status(404).json({
                success: false,
                message: "Topic not found"
            });
        }

        res.status(200).json({
            success: true,
            message: "Topic deleted successfully",
            data: topic
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

// Bulk update topics order
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

// Get topics with pagination
const getTopicsWithPagination = async (req, res) => {
    try {
        const { subjectId } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const query = subjectId ? { subject: subjectId } : {};

        const topics = await topicModel
            .find(query)
            .sort({ order: 1, createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate("subject", "name");

        const total = await topicModel.countDocuments(query);

        res.status(200).json({
            success: true,
            data: topics,
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

module.exports = {
    createTopic,
    searchTopics,
    getTopicsBySubject,
    getTopicDetails,      // Get single topic details
    updateTopic,          // Full update (PUT)
    patchTopic,           // Partial update (PATCH)
    deleteTopic,          // Delete topic
    updateTopicsOrder,    // Bulk order update
    getTopicsWithPagination  // Paginated topics
};