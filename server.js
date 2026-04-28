const express = require("express");
const connectDB = require("./config/db");
const rateLimit = require("express-rate-limit");

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.static("public"));

// Connect MongoDB
connectDB();

// Rate Limiter
const loginLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 5,
  message: "Too many login attempts. Try again later."
});

// Routes
const authRoutes = require("./routes/auth");

app.use("/auth/login", loginLimiter);
app.use("/auth", authRoutes);

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});