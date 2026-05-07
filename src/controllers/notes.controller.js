const noteModel = require("../models/note.model");
const topicModel = require("../models/topic.model");

// Create a new note
const createNote = async (req, res) => {
    try {
        const {
            topicId,
            title,
            content,
            importantNotes,
            resources,
            isPublished
        } = req.body;

        // Basic validation
        if (!topicId || !title) {
            return res.status(400).json({
                success: false,
                message: "Topic ID and title are required"
            });
        }

        // Check if topic exists
        const topic = await topicModel.findById(topicId);
        if (!topic) {
            return res.status(404).json({
                success: false,
                message: "Topic not found"
            });
        }

        // Check for existing note with same title under the same topic
        const existingNote = await noteModel.findOne({
            topic: topicId,
            title: title
        });

        if (existingNote) {
            return res.status(400).json({
                success: false,
                message: "A note with this title already exists under the same topic"
            });
        }

        // Create the note
        const note = await noteModel.create({
            topic: topicId,
            title,
            content: content || "",
            importantNotes: importantNotes || "",
            resources: resources || [],
            isPublished: isPublished !== undefined ? isPublished : true,
            version: 1
        });

        // Populate topic details for response
        const populatedNote = await noteModel.findById(note._id)
            .populate("topic", "name subject");

        res.status(201).json({
            success: true,
            message: "Note created successfully",
            data: populatedNote
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

// Get all notes with filtering and pagination
const getNotes = async (req, res) => {
    try {
        const {
            topicId,
            search,
            isPublished,
            page = 1,
            limit = 10,
            sortBy = "createdAt",
            sortOrder = "desc"
        } = req.query;

        let query = {};

        // Filter by topic
        if (topicId) {
            query.topic = topicId;
        }

        // Filter by published status
        if (isPublished !== undefined) {
            query.isPublished = isPublished === 'true';
        }

        // Search in title and content
        if (search) {
            query.$or = [
                { title: { $regex: search, $options: "i" } },
                { content: { $regex: search, $options: "i" } },
                { importantNotes: { $regex: search, $options: "i" } }
            ];
        }

        // Pagination
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        // Sorting
        const sort = {};
        sort[sortBy] = sortOrder === "desc" ? -1 : 1;

        // Execute query
        const notes = await noteModel
            .find(query)
            .sort(sort)
            .skip(skip)
            .limit(limitNum)
            .populate("topic", "name subject imageUrl");

        const total = await noteModel.countDocuments(query);

        res.status(200).json({
            success: true,
            data: notes,
            pagination: {
                currentPage: pageNum,
                totalPages: Math.ceil(total / limitNum),
                totalItems: total,
                itemsPerPage: limitNum,
                hasNextPage: pageNum < Math.ceil(total / limitNum),
                hasPrevPage: pageNum > 1
            }
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

// Get single note by ID
const getNoteById = async (req, res) => {
    try {
        const { noteId } = req.params;

        const note = await noteModel
            .findById(noteId)
            .populate("topic", "name subject summary imageUrl");

        if (!note) {
            return res.status(404).json({
                success: false,
                message: "Note not found"
            });
        }

        res.status(200).json({
            success: true,
            data: note
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

// Update note (full update)
const updateNote = async (req, res) => {
    try {
        const { noteId } = req.params;
        const updateData = req.body;

        // Check if note exists
        const existingNote = await noteModel.findById(noteId);
        if (!existingNote) {
            return res.status(404).json({
                success: false,
                message: "Note not found"
            });
        }

        // If topic is being updated, verify the new topic exists
        if (updateData.topicId) {
            const topic = await topicModel.findById(updateData.topicId);
            if (!topic) {
                return res.status(404).json({
                    success: false,
                    message: "New topic not found"
                });
            }
            updateData.topic = updateData.topicId;
            delete updateData.topicId;
        }

        // Check for duplicate title under the same topic (if title is being updated)
        if (updateData.title && updateData.title !== existingNote.title) {
            const topicId = updateData.topic || existingNote.topic;
            const duplicateNote = await noteModel.findOne({
                topic: topicId,
                title: updateData.title,
                _id: { $ne: noteId }
            });

            if (duplicateNote) {
                return res.status(400).json({
                    success: false,
                    message: "A note with this title already exists under the same topic"
                });
            }
        }

        // Increment version number on update
        updateData.version = (existingNote.version || 1) + 1;

        // Update the note
        const updatedNote = await noteModel.findByIdAndUpdate(
            noteId,
            updateData,
            {
                new: true,
                runValidators: true
            }
        ).populate("topic", "name subject");

        res.status(200).json({
            success: true,
            message: "Note updated successfully",
            data: updatedNote
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

// Partial update note (PATCH)
const patchNote = async (req, res) => {
    try {
        const { noteId } = req.params;
        const updateData = req.body;

        // Check if note exists
        const existingNote = await noteModel.findById(noteId);
        if (!existingNote) {
            return res.status(404).json({
                success: false,
                message: "Note not found"
            });
        }

        // Allowed fields for partial update
        const allowedFields = ['title', 'content', 'importantNotes', 'resources', 'isPublished'];
        
        let hasUpdates = false;
        allowedFields.forEach(field => {
            if (updateData[field] !== undefined) {
                existingNote[field] = updateData[field];
                hasUpdates = true;
            }
        });

        if (!hasUpdates) {
            return res.status(400).json({
                success: false,
                message: "No valid fields to update"
            });
        }

        // Check for duplicate title if title is being changed
        if (updateData.title && updateData.title !== existingNote.title) {
            const duplicateNote = await noteModel.findOne({
                topic: existingNote.topic,
                title: updateData.title,
                _id: { $ne: noteId }
            });

            if (duplicateNote) {
                return res.status(400).json({
                    success: false,
                    message: "A note with this title already exists under the same topic"
                });
            }
        }

        // Increment version
        existingNote.version = (existingNote.version || 1) + 1;
        await existingNote.save();

        const populatedNote = await noteModel.findById(noteId)
            .populate("topic", "name subject");

        res.status(200).json({
            success: true,
            message: "Note updated successfully",
            data: populatedNote
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

// Delete note
const deleteNote = async (req, res) => {
    try {
        const { noteId } = req.params;

        const note = await noteModel.findById(noteId);
        
        if (!note) {
            return res.status(404).json({
                success: false,
                message: "Note not found"
            });
        }

        // Store note info before deletion for response
        const deletedNoteInfo = {
            id: note._id,
            title: note.title,
            topic: note.topic
        };

        await noteModel.findByIdAndDelete(noteId);

        res.status(200).json({
            success: true,
            message: "Note deleted successfully",
            data: deletedNoteInfo
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

// Get notes by topic
const getNotesByTopic = async (req, res) => {
    try {
        const { topicId } = req.params;
        const { isPublished, page = 1, limit = 20 } = req.query;

        // Check if topic exists
        const topic = await topicModel.findById(topicId);
        if (!topic) {
            return res.status(404).json({
                success: false,
                message: "Topic not found"
            });
        }

        let query = { topic: topicId };
        if (isPublished !== undefined) {
            query.isPublished = isPublished === 'true';
        }

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const notes = await noteModel
            .find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum)
            .select("title version isPublished createdAt updatedAt");

        const total = await noteModel.countDocuments(query);

        res.status(200).json({
            success: true,
            data: {
                topic: {
                    id: topic._id,
                    name: topic.name,
                    subject: topic.subject
                },
                notes,
                pagination: {
                    currentPage: pageNum,
                    totalPages: Math.ceil(total / limitNum),
                    totalItems: total,
                    itemsPerPage: limitNum
                }
            }
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

// Toggle note publish status
const togglePublishStatus = async (req, res) => {
    try {
        const { noteId } = req.params;

        const note = await noteModel.findById(noteId);
        if (!note) {
            return res.status(404).json({
                success: false,
                message: "Note not found"
            });
        }

        note.isPublished = !note.isPublished;
        note.version = note.version + 1;
        await note.save();

        res.status(200).json({
            success: true,
            message: `Note ${note.isPublished ? 'published' : 'unpublished'} successfully`,
            data: {
                id: note._id,
                title: note.title,
                isPublished: note.isPublished,
                version: note.version
            }
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

// Bulk create notes
const bulkCreateNotes = async (req, res) => {
    try {
        const { notes } = req.body; // Array of note objects

        if (!notes || !Array.isArray(notes) || notes.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Notes array is required and cannot be empty"
            });
        }

        const results = {
            successful: [],
            failed: []
        };

        for (const noteData of notes) {
            try {
                // Validate required fields
                if (!noteData.topicId || !noteData.title) {
                    results.failed.push({
                        data: noteData,
                        error: "Topic ID and title are required"
                    });
                    continue;
                }

                // Check if topic exists
                const topic = await topicModel.findById(noteData.topicId);
                if (!topic) {
                    results.failed.push({
                        data: noteData,
                        error: "Topic not found"
                    });
                    continue;
                }

                // Check for duplicate
                const existingNote = await noteModel.findOne({
                    topic: noteData.topicId,
                    title: noteData.title
                });

                if (existingNote) {
                    results.failed.push({
                        data: noteData,
                        error: "Note with this title already exists under the same topic"
                    });
                    continue;
                }

                // Create note
                const note = await noteModel.create({
                    topic: noteData.topicId,
                    title: noteData.title,
                    content: noteData.content || "",
                    importantNotes: noteData.importantNotes || "",
                    resources: noteData.resources || [],
                    isPublished: noteData.isPublished !== undefined ? noteData.isPublished : true,
                    version: 1
                });

                results.successful.push({
                    id: note._id,
                    title: note.title
                });
            } catch (err) {
                results.failed.push({
                    data: noteData,
                    error: err.message
                });
            }
        }

        res.status(201).json({
            success: true,
            message: `Created ${results.successful.length} notes, failed ${results.failed.length}`,
            data: results
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

// Get note versions (history)
const getNoteVersions = async (req, res) => {
    try {
        const { noteId } = req.params;

        const note = await noteModel.findById(noteId);
        if (!note) {
            return res.status(404).json({
                success: false,
                message: "Note not found"
            });
        }

        // Note: This is a simplified version. For full version history,
        // you would need to implement a versioning system (like mongoose-history)
        res.status(200).json({
            success: true,
            data: {
                currentVersion: note.version,
                lastUpdated: note.updatedAt,
                created: note.createdAt,
                message: "Full version history requires a versioning plugin implementation"
            }
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

// Search notes within a topic
const searchNotesInTopic = async (req, res) => {
    try {
        const { topicId } = req.params;
        const { q, limit = 10 } = req.query;

        if (!q) {
            return res.status(400).json({
                success: false,
                message: "Search query (q) is required"
            });
        }

        const notes = await noteModel
            .find({
                topic: topicId,
                $or: [
                    { title: { $regex: q, $options: "i" } },
                    { content: { $regex: q, $options: "i" } },
                    { importantNotes: { $regex: q, $options: "i" } }
                ]
            })
            .limit(parseInt(limit))
            .select("title content importantNotes version isPublished createdAt")
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: notes.length,
            data: notes
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

// Add resource to note
const addResourceToNote = async (req, res) => {
    try {
        const { noteId } = req.params;
        const { title, url, type } = req.body;

        if (!title || !url) {
            return res.status(400).json({
                success: false,
                message: "Title and URL are required for resource"
            });
        }

        const note = await noteModel.findById(noteId);
        if (!note) {
            return res.status(404).json({
                success: false,
                message: "Note not found"
            });
        }

        note.resources.push({
            title,
            url,
            type: type || "link"
        });

        note.version = note.version + 1;
        await note.save();

        res.status(200).json({
            success: true,
            message: "Resource added successfully",
            data: note.resources
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

// Remove resource from note
const removeResourceFromNote = async (req, res) => {
    try {
        const { noteId, resourceIndex } = req.params;

        const note = await noteModel.findById(noteId);
        if (!note) {
            return res.status(404).json({
                success: false,
                message: "Note not found"
            });
        }

        const index = parseInt(resourceIndex);
        if (index < 0 || index >= note.resources.length) {
            return res.status(400).json({
                success: false,
                message: "Invalid resource index"
            });
        }

        note.resources.splice(index, 1);
        note.version = note.version + 1;
        await note.save();

        res.status(200).json({
            success: true,
            message: "Resource removed successfully",
            data: note.resources
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

module.exports = {
    createNote,
    getNotes,
    getNoteById,
    updateNote,
    patchNote,
    deleteNote,
    getNotesByTopic,
    togglePublishStatus,
    bulkCreateNotes,
    getNoteVersions,
    searchNotesInTopic,
    addResourceToNote,
    removeResourceFromNote
};