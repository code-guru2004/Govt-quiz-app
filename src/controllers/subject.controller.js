const subjectModel = require("../models/subject.model");


const createSubject = async (req, res) => {
  // Implementation for creating a subject
  try {
    const { name, description } = req.body;

    const subject = await subjectModel.create({
      name,
      description
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


module.exports = {
    createSubject,
    searchSubjects
}