const Test = require("../models/Test");
const Attempt = require("../models/Attempt");
const mongoose = require("mongoose");
const ApiError = require("../utils/apiError");
const Subject = require("../models/subject.model");
const Topic = require("../models/topic.model");
const Question = require("../models/Question");


class DatabaseService {
    static async withTransaction(fn) {
      const session = await mongoose.startSession();
      session.startTransaction();
      
      try {
        const result = await fn(session);
        await session.commitTransaction();
        return result;
      } catch (error) {
        if (session.inTransaction()) {
          await session.abortTransaction();
        }
        throw error;
      } finally {
        session.endSession();
      }
    }
  
    static async validateReferences(references, session) {
      const validationPromises = [];
      const errors = [];
  
      if (references.subject) {
        validationPromises.push(
          Subject.findById(references.subject).session(session)
            .then(subject => {
              if (!subject) errors.push("Referenced subject not found");
              return subject;
            })
        );
      }
  
      if (references.topic) {
        validationPromises.push(
          Topic.findById(references.topic).session(session)
            .then(topic => {
              if (!topic) errors.push("Referenced topic not found");
              if (references.subject && topic?.subject?.toString() !== references.subject) {
                errors.push("Topic does not belong to the specified subject");
              }
              return topic;
            })
        );
      }
  
      if (references.subjects?.length) {
        validationPromises.push(
          Subject.find({ _id: { $in: references.subjects } }).session(session)
            .then(subjects => {
              if (subjects.length !== references.subjects.length) {
                errors.push("One or more referenced subjects not found");
              }
              return subjects;
            })
        );
      }
  
      await Promise.all(validationPromises);
      
      if (errors.length > 0) {
        throw new AppError(errors.join(", "), 404);
      }
    }
  
    static async checkDuplicateTest(title, userId, isTemplate, session) {
      return Test.findOne({
        title: { $regex: new RegExp(`^${title.trim()}$`, "i") },
        createdBy: userId,
        isTemplate: isTemplate || false,
      }).session(session);
    }
  }

    module.exports = DatabaseService;