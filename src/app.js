const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const authRoutes = require("./routes/auth.route");
const adminRoutes = require("./routes/admin.route");
const userRoutes = require("./routes/user.route");
const app = express();

app.use(
  cors({
    origin: [
      "http://localhost:3000", // frontend local
      "https://test-easy-kappa.vercel.app/" // production later
    ],
    credentials: true
  })
);
app.use(cookieParser()); // 🔥 MUST be before routes
app.use(express.json());


app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/user", userRoutes);

app.get("/", (req, res) => {
  res.send("API running...");
});

module.exports = app;