// get all tests for a topic and subject
const Test = require("../models/Test");
const Attempt = require("../models/Attempt");
const mongoose = require("mongoose");
const ApiError = require("../utils/apiError");
const Subject = require("../models/subject.model");
const Topic = require("../models/topic.model");
const Question = require("../models/Question");


class TestValidationService {
    static validateBasicFields(parentTest, title, testType, hasSections, duration) {
      const errors = [];
      
      if (!parentTest && (!title || !title.trim())) {
        errors.push("Test title is required");
      }
      
      if (!parentTest && (!testType || !["topic", "subject", "full"].includes(testType))) {
        errors.push("Valid testType (topic/subject/full) is required");
      }
      
      if (!parentTest && !hasSections && (!duration || duration < 1)) {
        errors.push("Duration is required for tests without sections");
      }
      
      return errors;
    }
  
    static validateTemplateRequirements(isTemplate, recurrence) {
      const errors = [];
      
      if (isTemplate) {
        if (!recurrence || !recurrence.timeOfDay) {
          errors.push("Template must define recurrence with timeOfDay");
        }
      }
      
      return errors;
    }
  
    static validateTestTypeConfig(testType, subject, topic, subjects) {
      const errors = [];
      
      if (testType === "topic") {
        if (!topic) errors.push("Topic is required for topic test");
        if (!subject) errors.push("Subject is required for topic test");
      } else if (testType === "subject") {
        if (!subject) errors.push("Subject is required for subject test");
      } else if (testType === "full") {
        if (!subjects || subjects.length === 0) {
          errors.push("At least one subject is required for full test");
        }
      }
      
      return errors;
    }
  
    static validateSchedule(scheduleType, startTime, endTime) {
      const errors = [];
      
      if (scheduleType === "one-time") {
        if (!startTime || !endTime) {
          errors.push("startTime and endTime required for one-time test");
        }
      }
      
      return errors;
    }
  }

    module.exports = TestValidationService;