class AppError extends Error {
    constructor(message, statusCode, errorCode = null) {
      super(message);
      this.statusCode = statusCode;
      this.errorCode = errorCode;
      this.isOperational = true;
    }
  }
  
  class ErrorHandler {
    static handleMongoError(error) {
      if (error.code === 11000) {
        return new AppError(
          "A test with this configuration already exists",
          409,
          "DUPLICATE_TEST"
        );
      }
      
      if (error.name === "ValidationError") {
        const messages = Object.values(error.errors).map(e => e.message);
        return new AppError(messages.join(", "), 400, "VALIDATION_ERROR");
      }
      
      return error;
    }
  
    static sendErrorResponse(res, error) {
      const statusCode = error.statusCode || 400;
      const response = {
        success: false,
        message: error.message || "Failed to create test",
      };
      
      if (process.env.NODE_ENV === "development" && error.stack) {
        response.stack = error.stack;
      }
      
      if (error.errorCode) {
        response.code = error.errorCode;
      }
      
      return res.status(statusCode).json(response);
    }
  }

    module.exports = { AppError, ErrorHandler };