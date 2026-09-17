import express from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import nodemailer from "nodemailer";
import jwt from "jsonwebtoken";
import authenticate from "../middleware/authenticate.js";

import db from "../db.js";
import { logActivity } from "../utils/activityLogger.js";

const router = express.Router();

const OTP_EXPIRY_MS = 5 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

// =======================
// LOGIN ATTEMPT SECURITY
// =======================

const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_COOLDOWN_MS = 2 * 60 * 1000;

// Stores failed attempts while the Node server is running.
const loginAttempts = new Map();

function getLoginAttemptKey(req) {
  const ip =
    req.ip ||
    req.socket?.remoteAddress ||
    "unknown";

  // IMPORTANT:
  // The cooldown is intentionally NOT tied to a username.
  // After 5 failed normal-login attempts from this client/IP,
  // every username is blocked for 2 minutes.
  return String(ip);
}

function formatCooldown(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function checkLoginCooldown(req) {
  const key = getLoginAttemptKey(req);

  const entry = loginAttempts.get(key);

  if (!entry) {
    return {
      locked: false,
      retryAfter: 0,
    };
  }

  if (entry.lockedUntil) {
    const remainingMs =
      entry.lockedUntil - Date.now();

    if (remainingMs > 0) {
      return {
        locked: true,

        retryAfter: Math.max(
          1,
          Math.ceil(remainingMs / 1000),
        ),
      };
    }

    // Cooldown finished.
    loginAttempts.delete(key);

    return {
      locked: false,
      retryAfter: 0,
    };
  }

  return {
    locked: false,
    retryAfter: 0,
  };
}

function registerFailedLogin(req) {
  const key = getLoginAttemptKey(req);

  const existing =
    loginAttempts.get(key) || {
      attempts: 0,
      lockedUntil: null,
    };

  const attempts =
    existing.attempts + 1;

  // =============================
  // FIFTH FAILED ATTEMPT
  // =============================

  if (attempts >= MAX_LOGIN_ATTEMPTS) {
    const lockedUntil =
      Date.now() + LOGIN_COOLDOWN_MS;

    loginAttempts.set(key, {
      attempts: MAX_LOGIN_ATTEMPTS,
      lockedUntil,
    });

    return {
      locked: true,
      retryAfter: Math.ceil(
        LOGIN_COOLDOWN_MS / 1000,
      ),
      attemptsRemaining: 0,
    };
  }

  // =============================
  // ATTEMPTS 1 - 4
  // =============================

  loginAttempts.set(key, {
    attempts,
    lockedUntil: null,
  });

  return {
    locked: false,
    retryAfter: 0,

    attemptsRemaining:
      MAX_LOGIN_ATTEMPTS - attempts,
  };
}

function clearFailedLogins(req) {
  const key = getLoginAttemptKey(req);

  loginAttempts.delete(key);
}

console.log("✅ AUTH ROUTER LOADED - RESEND OTP ENABLED");

// =======================
// Nodemailer
// =======================
const transporter = nodemailer.createTransport({
  host: "smtp.ethereal.email",
  port: 587,
  secure: false,
  auth: {
    user: process.env.ETHEREAL_USER,
    pass: process.env.ETHEREAL_PASS,
  },
});

// =======================
// LOGIN
// =======================
router.post("/login", async (req, res) => {
  console.log("LOGIN REQUEST FOR:", req.body.username);

  const username =
    typeof req.body.username === "string" ? req.body.username.trim() : "";

  const password =
    typeof req.body.password === "string" ? req.body.password : "";

  if (!username || !password) {
    return res.status(400).json({
      error: "Username and password are required.",
    });
  }
// ==========================================
// CHECK LOGIN COOLDOWN BEFORE AUTHENTICATING
// ==========================================

const cooldown =
  checkLoginCooldown(req);

if (cooldown.locked) {
  return res.status(429).json({
    success: false,

    error:
      `Too many failed login attempts. ` +
      `Try again in ${formatCooldown(
        cooldown.retryAfter,
      )}.`,

    retry_after: cooldown.retryAfter,

    locked: true,
  });
}
  try {
    const [rows] = await db.execute(
      `
      SELECT
        u.user_id,
        u.username,
        u.email,
        u.password_hash,
        u.role_id,
        u.is_verified,
        u.is_active,
        r.role_name
      FROM users u
      INNER JOIN roles r
        ON u.role_id = r.role_id
      WHERE u.username = ?
      `,
      [username],
    );

    // Username does not exist
    if (rows.length === 0) {
  const failed =
    registerFailedLogin(req);

  // =============================
  // ACCOUNT NOW TEMPORARILY LOCKED
  // =============================

  if (failed.locked) {
    return res.status(429).json({
      success: false,

      error:
        `Too many failed login attempts. ` +
        `Try again in ${formatCooldown(
          failed.retryAfter,
        )}.`,

      retry_after: failed.retryAfter,

      locked: true,

      attempts_remaining: 0,
    });
  }

  // =============================
  // STILL HAS ATTEMPTS
  // =============================

  return res.status(401).json({
    success: false,

    error:
      `Invalid username or password. ` +
      `${failed.attemptsRemaining} ` +
      `attempt${
        failed.attemptsRemaining === 1
          ? ""
          : "s"
      } remaining.`,

    attempts_remaining:
      failed.attemptsRemaining,
  });
}

    const user = rows[0];

    const match = await bcrypt.compare(password, user.password_hash);

    if (!match) {
  const failed =
    registerFailedLogin(req);

  await logActivity(
    user.user_id,
    "FAILED LOGIN",
    "Authentication",
    `${user.username} entered an incorrect password.`,
  );

  // =============================
  // FIFTH FAILURE
  // =============================

  if (failed.locked) {
    await logActivity(
      user.user_id,
      "LOGIN COOLDOWN",
      "Authentication",
      `${user.username} reached the shared 5-attempt login limit and this client was temporarily blocked for 2 minutes.`,
    );

    return res.status(429).json({
      success: false,

      error:
        `Too many failed login attempts. ` +
        `Try again in ${formatCooldown(
          failed.retryAfter,
        )}.`,

      retry_after: failed.retryAfter,

      locked: true,

      attempts_remaining: 0,
    });
  }

  // =============================
  // ATTEMPTS 1 - 4
  // =============================

  return res.status(401).json({
    success: false,

    error:
      `Invalid username or password. ` +
      `${failed.attemptsRemaining} ` +
      `attempt${
        failed.attemptsRemaining === 1
          ? ""
          : "s"
      } remaining.`,

    attempts_remaining:
      failed.attemptsRemaining,
  });
}

    // Correct password: reset previous failed attempts.
    clearFailedLogins(req);

    // Account inactive
    if (!user.is_active) {
      await logActivity(
        user.user_id,
        "LOGIN BLOCKED",
        "Authentication",
        `${user.username} attempted to login while inactive.`,
      );

      return res.status(403).json({
        error: "Your account has been deactivated.",
      });
    }

    // Generate OTP
    const otp = crypto.randomInt(100000, 999999).toString();

    // Remove any existing OTP for this user
    await db.execute("DELETE FROM otp_codes WHERE user_id = ?", [user.user_id]);

    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

    await db.execute(
      `
      INSERT INTO otp_codes
      (user_id, otp_code, expires_at)
      VALUES (?, ?, ?)
      `,
      [user.user_id, otp, expiresAt],
    );

    const info = await transporter.sendMail({
      from: '"PTC Portal" <noreply@ptc.edu.ph>',
      to: user.email,
      subject: "PTC Portal OTP",
      text: `Your OTP is ${otp}.`,
      html: `...`,
    });

    console.log("Preview URL:", nodemailer.getTestMessageUrl(info));

    res.json({
      message: "OTP sent successfully.",
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Server Error",
    });
  }
});

// =======================
// RESEND OTP
// =======================
//
// This route is available only while an OTP record already
// exists for the username. It does NOT create a new login
// session by itself.
//
// Cooldown is enforced on the backend using the OTP expiry
// timestamp, so refreshing the frontend cannot bypass it.
//
router.post(["/resend-otp", "/auth/resend-otp"], async (req, res) => {
  const username =
    typeof req.body.username === "string" ? req.body.username.trim() : "";

  console.log("RESEND OTP REQUEST RECEIVED:", {
    originalUrl: req.originalUrl,
    baseUrl: req.baseUrl,
    path: req.path,
    username,
  });

  if (!username) {
    return res.status(400).json({
      success: false,
      error: "Username is required.",
    });
  }

  try {
    // ==========================================
    // 1. Find the account
    // ==========================================

    const [users] = await db.execute(
      `
      SELECT
        user_id,
        username,
        email,
        is_active
      FROM users
      WHERE username = ?
      LIMIT 1
      `,
      [username],
    );

    if (users.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Your OTP session is unavailable. Please login again.",
      });
    }

    const user = users[0];

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        error: "Your account has been deactivated.",
      });
    }

    // ==========================================
    // 2. Existing OTP is required
    //
    // This prevents /resend-otp from being used
    // to start an OTP flow without a real login.
    // ==========================================

    const [otpRows] = await db.execute(
      `
      SELECT
        expires_at
      FROM otp_codes
      WHERE user_id = ?
      LIMIT 1
      `,
      [user.user_id],
    );

    if (otpRows.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Your OTP session has expired. Please login again.",
      });
    }

    // ==========================================
    // 3. Enforce 60-second resend cooldown
    //
    // Every OTP lives for OTP_EXPIRY_MS.
    // Therefore:
    //
    // issued_at = expires_at - OTP_EXPIRY_MS
    // ==========================================

    const expiresAtMs = new Date(otpRows[0].expires_at).getTime();

    if (!Number.isFinite(expiresAtMs)) {
      return res.status(500).json({
        success: false,
        error: "Unable to validate the OTP cooldown.",
      });
    }

    const issuedAtMs = expiresAtMs - OTP_EXPIRY_MS;
    const nextAllowedAtMs = issuedAtMs + OTP_RESEND_COOLDOWN_MS;
    const remainingMs = nextAllowedAtMs - Date.now();

    if (remainingMs > 0) {
      const retryAfter = Math.max(
        1,
        Math.ceil(remainingMs / 1000),
      );

      return res.status(429).json({
        success: false,
        error: `Please wait ${retryAfter} second${
          retryAfter === 1 ? "" : "s"
        } before requesting another OTP.`,
        retry_after: retryAfter,
      });
    }

    // ==========================================
    // 4. Create a fresh OTP
    // ==========================================

    const otp = crypto.randomInt(100000, 999999).toString();
    const newExpiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

    await db.execute(
      `
      UPDATE otp_codes
      SET
        otp_code = ?,
        expires_at = ?
      WHERE user_id = ?
      `,
      [otp, newExpiresAt, user.user_id],
    );

    // ==========================================
    // 5. Send the new OTP
    // ==========================================

    const info = await transporter.sendMail({
      from: '"PTC Portal" <noreply@ptc.edu.ph>',
      to: user.email,
      subject: "PTC Portal OTP",
      text: `Your new OTP is ${otp}.`,
      html: `...`,
    });

    console.log(
      "RESEND OTP PREVIEW URL:",
      nodemailer.getTestMessageUrl(info),
    );

    return res.json({
      success: true,
      message: "A new OTP has been sent successfully.",
      cooldown_seconds: 60,
    });
  } catch (err) {
    console.error("RESEND OTP ERROR:", err);

    return res.status(500).json({
      success: false,
      error: "Unable to resend OTP.",
    });
  }
});

router.post("/verify-otp", async (req, res) => {
  const username =
    typeof req.body.username === "string" ? req.body.username.trim() : "";

  const otp = typeof req.body.otp === "string" ? req.body.otp.trim() : "";

  if (!username || !otp) {
    return res.status(400).json({
      error: "Username and OTP are required.",
    });
  }

  try {
    // ==========================================
    // 1. Find user + current role
    // ==========================================

    const [users] = await db.execute(
      `
      SELECT
        u.user_id,
        u.username,
        u.email,
        u.role_id,
        u.is_verified,
        u.is_active,
        r.role_name
      FROM users u
      INNER JOIN roles r
        ON u.role_id = r.role_id
      WHERE u.username = ?
      LIMIT 1
      `,
      [username],
    );

    if (users.length === 0) {
      return res.status(404).json({
        error: "User not found.",
      });
    }

    const user = users[0];

    // ==========================================
    // 2. Make sure account is still active
    // ==========================================

    if (!user.is_active) {
      return res.status(403).json({
        error: "Your account has been deactivated.",
      });
    }

    // ==========================================
    // 3. Find OTP
    // ==========================================

    const [otpRows] = await db.execute(
      `
      SELECT
        otp_code,
        expires_at
      FROM otp_codes
      WHERE user_id = ?
      LIMIT 1
      `,
      [user.user_id],
    );

    if (otpRows.length === 0) {
      return res.status(400).json({
        error: "OTP not found.",
      });
    }

    const storedOtp = otpRows[0];

    // ==========================================
    // 4. Check expiration
    // ==========================================

    if (new Date() > new Date(storedOtp.expires_at)) {
      await db.execute(
        `
        DELETE FROM otp_codes
        WHERE user_id = ?
        `,
        [user.user_id],
      );

      return res.status(400).json({
        error: "OTP has expired.",
      });
    }

    // ==========================================
    // 5. Compare OTP
    // ==========================================

    if (String(storedOtp.otp_code) !== String(otp)) {
      return res.status(400).json({
        error: "Invalid OTP.",
      });
    }

    // ==========================================
    // 6. Verify account
    // ==========================================

    if (!user.is_verified) {
      await db.execute(
        `
        UPDATE users
        SET is_verified = 1
        WHERE user_id = ?
        `,
        [user.user_id],
      );

      user.is_verified = 1;
    }

    // ==========================================
    // 7. Delete used OTP
    // ==========================================

    await db.execute(
      `
      DELETE FROM otp_codes
      WHERE user_id = ?
      `,
      [user.user_id],
    );

    // ==========================================
    // 8. Check JWT configuration
    // ==========================================

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is not configured.");

      return res.status(500).json({
        success: false,
        error: "Authentication configuration error.",
      });
    }

    // ==========================================
    // 9. Create JWT
    // ==========================================

    const token = jwt.sign(
      {
        user_id: Number(user.user_id),
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "8h",
      },
    );

    // ==========================================
    // 10. Log successful login
    // ==========================================

    await logActivity(
      user.user_id,
      "LOGIN",
      "Authentication",
      `${user.username} logged in successfully.`,
    );

    // ==========================================
    // 11. Return authenticated session
    // ==========================================

    return res.json({
      success: true,
      message: "Login successful.",

      token,

      user: {
        user_id: Number(user.user_id),
        username: user.username,
        email: user.email,
        role_id: Number(user.role_id),

        // Frontend canonical role field
        role: user.role_name,

        // Keep DB/API field too
        role_name: user.role_name,
      },
    });
  } catch (err) {
    console.error("VERIFY OTP ERROR:", err);

    return res.status(500).json({
      success: false,
      error: "Server error.",
    });
  }
});
// =======================
// CURRENT AUTHENTICATED USER
// =======================
router.get("/me", authenticate, async (req, res) => {
  try {
    return res.json({
      success: true,

      user: {
        user_id: Number(user.user_id),
        username: user.username,
        email: user.email,
        role_id: Number(user.role_id),

        // Frontend canonical role field
        role: user.role_name,

        // Keep DB/API field too
        role_name: user.role_name,
      },
    });
  } catch (error) {
    console.error("GET /auth/me ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load authenticated user.",
    });
  }
});

// =======================
// DEVELOPMENT LOGIN
// =======================
//
// IMPORTANT:
// This route must NEVER be enabled in production.
//
router.post("/dev-login", async (req, res) => {
  // Disable this endpoint in production.
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({
      success: false,
      message: "Endpoint not found.",
    });
  }

  const { username } = req.body;

  if (!username) {
    return res.status(400).json({
      success: false,
      message: "Username is required.",
    });
  }

  try {
    // ------------------------------------------
    // Load REAL user + REAL role from database
    // ------------------------------------------

    const [rows] = await db.execute(
      `
      SELECT
        u.user_id,
        u.username,
        u.email,
        u.role_id,
        u.is_active,
        u.is_verified,
        r.role_name
      FROM users u
      INNER JOIN roles r
        ON r.role_id = u.role_id
      WHERE u.username = ?
      LIMIT 1
      `,
      [username],
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Development user not found.",
      });
    }

    const user = rows[0];

    // ------------------------------------------
    // Account validation
    // ------------------------------------------

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: "Development account is inactive.",
      });
    }

    if (!user.is_verified) {
      return res.status(403).json({
        success: false,
        message: "Development account is not verified.",
      });
    }

    // ------------------------------------------
    // JWT configuration
    // ------------------------------------------

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is not configured.");

      return res.status(500).json({
        success: false,
        message: "Authentication configuration error.",
      });
    }

    // ------------------------------------------
    // Create REAL JWT
    // ------------------------------------------

    const token = jwt.sign(
      {
        user_id: Number(user.user_id),
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "8h",
      },
    );

    // ------------------------------------------
    // Optional activity log
    // ------------------------------------------

    await logActivity(
      user.user_id,
      "DEV LOGIN",
      "Authentication",
      `${user.username} logged in using development access.`,
    );

    // ------------------------------------------
    // Return exactly the same structure as OTP
    // ------------------------------------------

    return res.json({
      success: true,
      message: "Development login successful.",

      token,

      user: {
        user_id: Number(user.user_id),
        username: user.username,
        email: user.email,
        role_id: Number(user.role_id),

        role: user.role_name,
        role_name: user.role_name,
      },
    });
  } catch (error) {
    console.error("DEV LOGIN ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Development login failed.",
    });
  }
});

export default router;
