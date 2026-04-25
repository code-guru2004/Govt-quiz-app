const Test = require("../models/Test");
const Attempt = require("../models/Attempt");
const mongoose = require("mongoose");
const ApiError = require("../utils/apiError");
const Subject = require("../models/subject.model");
const Topic = require("../models/topic.model");
const Question = require("../models/Question");
const TestBuilderService = require("./testBuilderService");


class TestCopyService {
    static async validateParentTemplate(parentTestId, session) {
      const parent = await Test.findById(parentTestId).session(session);
      
      if (!parent) {
        throw new Error("Parent template not found");
      }
      
      if (!parent.recurrence || !parent.recurrence.timeOfDay) {
        throw new Error("Parent template missing recurrence config");
      }
      
      return parent;
    }
  
    static async checkDuplicateInstance(parentTestId, validForDate, session) {
      const existing = await Test.findOne({
        parentTest: parentTestId,
        validForDate: new Date(validForDate),
      }).session(session);
      
      if (existing) {
        throw new Error("Test already exists for this date");
      }
    }
  
    static copyFromTemplate(parent, validForDate) {
      const testDate = new Date(validForDate);
      const totalDuration = TestBuilderService.calculateTotalDuration(parent);
      const { startTime, endTime } = TestBuilderService.generateTestTimes(
        validForDate,
        parent.recurrence.timeOfDay,
        totalDuration
      );
      
      return {
        title: `${parent.title} - ${testDate.toISOString().split("T")[0]}`,
        description: parent.description,
        parentTest: parent._id,
        recurrence: null,
        duration: parent.duration,
        shuffleQuestions: parent.shuffleQuestions,
        showResultImmediately: parent.showResultImmediately,
        allowResume: parent.allowResume,
        maxAttempts: parent.maxAttempts,
        isFeatured: parent.isFeatured,
        scheduleType: parent.scheduleType,
        hasSections: parent.hasSections,
        sections: parent.sections.map((section) => ({
          title: section.title,
          duration: section.duration,
          questions: [],
        })),
        testType: parent.testType,
        subject: parent.subject || null,
        topic: parent.topic || null,
        subjects: parent.subjects || [],
        totalMarks: parent.totalMarks,
        negativeMarks: parent.negativeMarks,
        startTime,
        endTime,
        validForDate: testDate,
      };
    }
  }

    module.exports = TestCopyService;