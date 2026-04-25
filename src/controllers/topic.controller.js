
const topicModel = require("../models/topic.model");
const subjectModel = require("../models/subject.model");

const createTopic = async (req, res) => {
    // Implementation for creating a topic
    try {
      const { name, subjectId } = req.body;
    // 🔥 Basic validatio n
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
    }
      catch (err) {
        res.status(500).json({
          success: false,
          message: err.message
        });
      }
  };
module.exports = {
    createTopic,
    searchTopics,
    getTopicsBySubject
}