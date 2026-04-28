const express = require("express");
const bcrypt = require("bcrypt");
const speakeasy = require("speakeasy");
const QRCode = require("qrcode");

const router = express.Router();
const User = require("../models/User");

const saltRounds = 10;
const MAX_ATTEMPTS = 5;
const LOCK_TIME = 2 * 60 * 1000; // 2 minutes

// ================= REGISTER =================
router.post("/register", async (req, res) => {
  const { username, password } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const user = new User({
      username,
      password: hashedPassword
    });

    await user.save();

    res.json({
      message: "User registered",
      hash: hashedPassword
    });
  } catch (err) {
    res.status(500).send("Error registering user");
  }
});


// ================= LOGIN WITH LOCKOUT + 2FA =================
router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  const user = await User.findOne({ username });
  if (!user) return res.status(400).send("User not found");

  //Check lock
  if (user.lockUntil && user.lockUntil > Date.now()) {
    return res.status(403).send("Account locked. Try again later.");
  }

  const isMatch = await bcrypt.compare(password, user.password);

  if (!isMatch) {
    user.loginAttempts += 1;

    if (user.loginAttempts >= MAX_ATTEMPTS) {
      user.lockUntil = Date.now() + LOCK_TIME;
      await user.save();
      return res.status(403).send("Account locked due to multiple failed attempts.");
    }

    await user.save();
    return res.status(400).send("Wrong password");
  }

  //Reset after success
  user.loginAttempts = 0;
  user.lockUntil = null;
  await user.save();

  //Enforce 2FA
  if (user.twoFactorEnabled) {
    return res.send("Enter OTP");
  }

  res.send("Login successful (no 2FA)");
});


// ================= GENERATE 2FA (QR) =================
router.post("/generate-2fa", async (req, res) => {
  const { username } = req.body;

  const user = await User.findOne({ username });
  if (!user) return res.status(400).send("User not found");

  const secret = speakeasy.generateSecret({ length: 20 });

  user.twoFactorSecret = secret.base32;
  await user.save();

  const qr = await QRCode.toDataURL(secret.otpauth_url);

  res.json({
    message: "Scan QR with Authenticator",
    qr
  });
});


// ================= VERIFY OTP =================
router.post("/verify-2fa", async (req, res) => {
  const { username, token } = req.body;

  const user = await User.findOne({ username });
  if (!user) return res.status(400).send("User not found");

  const verified = speakeasy.totp.verify({
    secret: user.twoFactorSecret,
    encoding: "base32",
    token,
    window: 1
  });

  if (!verified) {
    return res.status(400).send("Invalid OTP");
  }

  user.twoFactorEnabled = true;
  await user.save();

  res.send("OTP Verified. Login Successful");
});

module.exports = router;