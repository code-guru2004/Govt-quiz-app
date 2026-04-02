// Register API test
URL: http://localhost:3000/api/auth/register [POST]
data: {
    "email": "abc@gmail.com",
    "name": "abc",
    "password": "123456",
    "mobile": "9876543210"
}
    
// Login API test
URL: http://localhost:3000/api/auth/login [POST]
data: {
    "email": "nayan@test.com",
    "password": "123456"
  }

// Create Question API test (Admin only)
URL: http://localhost:3000/api/admin/questions [POST]
data: {
    "questionText": "What is 2 + 2?",
    "options": ["1", "2", "3", "4"],
    "correctAnswer": "4",
    "subject": "Math",
    "topic": "Arithmetic",
    "difficulty": "easy",
    "marks": 2,
    "negativeMarks": 0.5
  }

// create Test API test (Admin only)
URL: http://localhost:3000/api/admin/tests [POST]
data: {
  "title": "Math Mock Test 1",
  "description": "Basic arithmetic test",
  "duration": 60,
  "startTime": "2026-04-05T10:00:00.000Z",
  "endTime": "2026-04-05T12:00:00.000Z",
  "maxAttempts": 2,
  "allowResume": true,
  "shuffleQuestions": true,
  "showResultImmediately": true
}

// Add Questions to Test API test (Admin only)
URL: http://localhost:3000/api/admin/tests/{testId}/questions [POST]
data: {
  "questionIds": [
    "69ce75bd0694dae9a8e493bd",
    "69ce7a850da363bb741b6548"
  ]
}

// Make Test Active API test (Admin only)
URL: http://localhost:3000/api/admin/tests/{testId}/activate [POST]
