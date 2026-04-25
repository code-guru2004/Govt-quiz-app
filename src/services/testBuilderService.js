const Test = require("../models/Test");
const Attempt = require("../models/Attempt");
const mongoose = require("mongoose");
const ApiError = require("../utils/apiError");
const Subject = require("../models/subject.model");
const Topic = require("../models/topic.model");
const Question = require("../models/Question");



class TestBuilderService {
    static buildBaseTestData(reqBody, userId) {
      const {
        title,
        description,
        duration,
        scheduleType,
        recurrence,
        totalMarks,
        maxAttempts,
        allowResume,
        shuffleQuestions,
        showResultImmediately,
        hasSections,
        isFeatured,
        testType,
        subject,
        topic,
        subjects,
        negativeMarks,
      } = reqBody;
  
      return {
        title: title?.trim(),
        description: description?.trim() || "",
        scheduleType: scheduleType || "one-time",
        recurrence: recurrence || null,
        totalMarks: totalMarks || 0,
        isPublished: false,
        maxAttempts: maxAttempts || 1,
        allowResume: allowResume || false,
        shuffleQuestions: shuffleQuestions || false,
        showResultImmediately: showResultImmediately || false,
        hasSections: hasSections || false,
        isFeatured: isFeatured || false,
        testType,
        negativeMarks: negativeMarks || 0,
        createdBy: userId,
        questions: [],
        sections: [],
      };
    }
  
    static buildSectionData(sections, hasSections) {
      if (!hasSections) return [];
      
      if (!sections || sections.length === 0) {
        throw new Error("Sections are required when hasSections is true");
      }
      
      return sections.map((section) => ({
        title: section.title.trim(),
        duration: section.duration,
        questions: [],
      }));
    }
  
    static buildTestTypeReferences(testType, subject, topic, subjects) {
      const references = {
        subject: null,
        topic: null,
        subjects: [],
      };
  
      if (testType === "topic") {
        references.topic = topic;
        references.subject = subject;
        references.subjects = [];
      } else if (testType === "subject") {
        references.subject = subject;
        references.topic = null;
        references.subjects = [];
      } else if (testType === "full") {
        references.subjects = subjects;
        references.subject = null;
        references.topic = null;
      }
  
      return references;
    }
  
    static calculateTotalDuration(testData) {
      if (testData.hasSections) {
        return testData.sections.reduce((sum, sec) => sum + sec.duration, 0);
      }
      return testData.duration;
    }
  
    static generateTestTimes(validForDate, recurrenceTimeOfDay, totalDuration) {
      const testDate = new Date(validForDate);
      const [hours, minutes] = recurrenceTimeOfDay.split(":");
      
      const startTime = new Date(testDate);
      startTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
      
      const endTime = new Date(startTime.getTime() + totalDuration * 60000);
      
      return { startTime, endTime };
    }
  }

    module.exports = TestBuilderService;