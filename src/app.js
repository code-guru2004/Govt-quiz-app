const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const authRoutes = require("./routes/auth.route");
const adminRoutes = require("./routes/admin.route");
const userRoutes = require("./routes/user.route");
const subjectRoutes = require("./routes/subject.route");
const topicRoutes = require("./routes/topic.route"); 
const testRoutes = require("./routes/test.route");
const attemptRoutes = require("./routes/attempt.route");
const leaderboardRoutes = require("./routes/leaderboard.routes");
const bookmarkRoutes = require("./routes/bookmark.routes");


const app = express();

app.use(
  cors({
    origin: [
      "http://localhost:3000", // frontend local
      "https://test-easy-kappa.vercel.app", // production later,
      "https://test-easy-mate.vercel.app"
    ],
    credentials: true
  })
);
app.use(cookieParser()); // 🔥 MUST be before routes
app.use(express.json());


app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/user", userRoutes);
app.use("/api/subjects", subjectRoutes);
app.use("/api/topics", topicRoutes);
app.use("/api/tests", testRoutes);
app.use("/api/attempts",attemptRoutes);
app.use("/api/leaderboard", leaderboardRoutes);
app.use("/api/bookmarks", bookmarkRoutes);

app.get("/", (req, res) => {
  res.send("API running...");
});

module.exports = app;