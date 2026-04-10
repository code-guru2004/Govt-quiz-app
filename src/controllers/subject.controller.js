const subjectModel = require("../models/subject.model");
const Test = require("../models/Test");
const Question = require("../models/Question");
const createSubject = async (req, res) => {
  // Implementation for creating a subject
  try {
    const { name, description, imageUrl } = req.body;

    const subject = await subjectModel.create({
      name,
      description,
      imageUrl
    });

    res.status(201).json({
      success: true,
      data: subject
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
}
const searchSubjects  = async (req, res) => {
    // Implementation for creating a topic
    try {
      const { search } = req.query;
  
      const query = search
        ? { name: { $regex: search, $options: "i" } }
        : {};
  
      const subjects = await subjectModel.find(query).sort({ name: 1 });
  
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
  }

// get all subjects
const getAllSubjects = async (req, res) => {
    try {
        const subjects = await subjectModel.find().sort({ name: 1 });

        res.status(200).json({
            success: true,
            count: subjects.length,
            data: subjects
        });
    }
    catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
}

// get all subjects with details (for admin dashboard)
const getAllSubjectsWithDetails = async (req, res) => {
    try {
        const subjects = await subjectModel.find().sort({ name: 1 });

        // get total tests for each subject
        // get total questions for each subject
        const subjectsWithDetails = await Promise.all(subjects.map(async (subject) => {
            const testCount = await Test.countDocuments({ subject: subject._id, topic: null, isPublished: true,startTime: { $lte: new Date() }, endTime: { $gte: new Date() } });
            const questionCount = await Question.countDocuments({ subject: subject._id });
            return {
                ...subject.toObject(),
                testCount,
                questionCount
            }
        }));

        res.status(200).json({
            success: true,
            count: subjectsWithDetails.length,
            data: subjectsWithDetails
        });
    }
    catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
}
module.exports = {
    createSubject,
    searchSubjects,
    getAllSubjects,
    getAllSubjectsWithDetails
}