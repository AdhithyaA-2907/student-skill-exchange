// Load values from the local .env file before using process.env.
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mysql = require("mysql2");
const { createHash, randomBytes, scrypt, timingSafeEqual } = require("crypto");
const { promisify } = require("util");

const app = express();
const PORT = process.env.PORT || 5000;
const scryptAsync = promisify(scrypt);
const publicStudentFields = "student_id, user_id, name, email, department, year";
// Qualify fields when students is joined with auth_sessions to avoid ambiguous column names.
const sessionStudentFields = "students.student_id, students.user_id, students.name, students.email, students.department, students.year";
const SESSION_DURATION_DAYS = 7;

// Allow requests from the frontend and accept JSON request bodies.
app.use(cors());
app.use(express.json());

// Create a reusable pool for the Railway MySQL database.
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Check the database connection when the API starts.
pool.getConnection((error, connection) => {
  if (error) {
    console.error("Database connection failed:", error.message);
    return;
  }

  console.log("Connected to the Railway MySQL database.");
  connection.release();
});

// Use this endpoint to confirm that the API is running.
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "StudentSkillExchange API is running"
  });
});

// Check that an ID in the URL is a positive whole number.
function getStudentId(id) {
  const studentId = Number(id);
  return Number.isInteger(studentId) && studentId > 0 ? studentId : null;
}

// Return a consistent message when a unique account field is already in use.
function handleDatabaseError(error, res) {
  console.error("Database query failed:", error.message);

  if (error.code === "ER_DUP_ENTRY") {
    return res.status(409).json({
      success: false,
      message: error.message.includes("user_id") ? "That User ID is already in use" : "A student with this email already exists"
    });
  }

  return res.status(500).json({
    success: false,
    message: "Database operation failed"
  });
}

// Passwords are stored as salted scrypt hashes, never as plain text.
async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = await scryptAsync(password, salt, 64);
  return `scrypt$${salt}$${hash.toString("hex")}`;
}

async function passwordMatches(password, storedHash) {
  const [algorithm, salt, hash] = String(storedHash || "").split("$");
  if (algorithm !== "scrypt" || !salt || !hash) return false;

  const expected = Buffer.from(hash, "hex");
  const actual = await scryptAsync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// Tokens are random, but only their SHA-256 hashes are stored in MySQL.
function hashSessionToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function getSessionToken(req) {
  const authorization = req.get("authorization") || "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : req.get("x-session-token");
}

async function createSession(studentId) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000);
  await pool.promise().query(
    "INSERT INTO auth_sessions (student_id, token_hash, expires_at) VALUES (?, ?, ?)",
    [studentId, hashSessionToken(token), expiresAt]
  );
  return token;
}

// Returns the authenticated student, or sends a 401 response and returns null.
async function requireAuthenticatedStudent(req, res) {
  const token = getSessionToken(req);
  if (!token) {
    res.status(401).json({ success: false, message: "Please sign in to continue" });
    return null;
  }

  try {
    const [rows] = await pool.promise().query(
      `SELECT ${sessionStudentFields}
       FROM auth_sessions
       JOIN students ON auth_sessions.student_id = students.student_id
       WHERE auth_sessions.token_hash = ? AND auth_sessions.expires_at > NOW()`,
      [hashSessionToken(token)]
    );
    if (!rows.length) {
      res.status(401).json({ success: false, message: "Your session has expired. Please sign in again." });
      return null;
    }
    return rows[0];
  } catch (error) {
    console.error("Session verification failed:", error.message);
    res.status(500).json({ success: false, message: "Unable to verify your session" });
    return null;
  }
}

// Create a new student.
app.post("/api/students", async (req, res) => {
  const { user_id, password, name, email, department, year } = req.body;
  const userId = String(user_id || "").trim();

  if (!userId || !password || !name || !email) {
    return res.status(400).json({
      success: false,
      message: "User ID, password, name, and email are required"
    });
  }

  let passwordHash;
  try {
    passwordHash = await hashPassword(password);
  } catch (error) {
    console.error("Password hashing failed:", error.message);
    return res.status(500).json({ success: false, message: "Unable to create the account" });
  }

  const sql = "INSERT INTO students (user_id, password_hash, name, email, department, year) VALUES (?, ?, ?, ?, ?, ?)";
  pool.query(sql, [userId, passwordHash, name, email, department || null, year || null], async (error, result) => {
    if (error) return handleDatabaseError(error, res);

    try {
      const sessionToken = await createSession(result.insertId);
      res.status(201).json({
        success: true,
        session_token: sessionToken,
        student: {
          student_id: result.insertId,
          user_id: userId,
          name,
          email,
          department: department || null,
          year: year || null
        }
      });
    } catch (sessionError) {
      console.error("Session creation failed:", sessionError.message);
      res.status(500).json({ success: false, message: "Profile created, but sign-in could not be completed" });
    }
  });
});

// Get every student without exposing password hashes.
app.get("/api/students", (req, res) => {
  pool.query(`SELECT ${publicStudentFields} FROM students`, (error, students) => {
    if (error) return handleDatabaseError(error, res);

    res.status(200).json({ success: true, students });
  });
});

// Get one student by ID.
app.get("/api/students/:id", (req, res) => {
  const studentId = getStudentId(req.params.id);
  if (!studentId) {
    return res.status(400).json({ success: false, message: "Invalid student ID" });
  }

  pool.query(`SELECT ${publicStudentFields} FROM students WHERE student_id = ?`, [studentId], (error, students) => {
    if (error) return handleDatabaseError(error, res);
    if (students.length === 0) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    res.status(200).json({ success: true, student: students[0] });
  });
});

// Verify credentials on the server before the frontend changes profiles.
app.post("/api/auth/login", (req, res) => {
  const userId = String(req.body.user_id || "").trim();
  const password = req.body.password;
  if (!userId || !password) {
    return res.status(400).json({ success: false, message: "User ID and password are required" });
  }

  pool.query(`SELECT ${publicStudentFields}, password_hash FROM students WHERE user_id = ?`, [userId], async (error, students) => {
    if (error) return handleDatabaseError(error, res);
    const student = students[0];

    try {
      if (!student || !(await passwordMatches(password, student.password_hash))) {
        return res.status(401).json({ success: false, message: "Invalid User ID or password." });
      }
    } catch (verificationError) {
      console.error("Password verification failed:", verificationError.message);
      return res.status(500).json({ success: false, message: "Unable to verify credentials" });
    }

    const { password_hash, ...safeStudent } = student;
    try {
      const sessionToken = await createSession(safeStudent.student_id);
      return res.status(200).json({ success: true, session_token: sessionToken, student: safeStudent });
    } catch (sessionError) {
      console.error("Session creation failed:", sessionError.message);
      return res.status(500).json({ success: false, message: "Unable to start a session" });
    }
  });
});

// Verify a saved token before the frontend displays an authenticated dashboard.
app.get("/api/auth/session", async (req, res) => {
  const student = await requireAuthenticatedStudent(req, res);
  if (!student) return;
  res.status(200).json({ success: true, student });
});

// Invalidate only the current token. The browser also clears its local token.
app.post("/api/auth/logout", async (req, res) => {
  const token = getSessionToken(req);
  if (!token) return res.status(200).json({ success: true, message: "Logged out" });

  try {
    await pool.promise().query("DELETE FROM auth_sessions WHERE token_hash = ?", [hashSessionToken(token)]);
    res.status(200).json({ success: true, message: "Logged out" });
  } catch (error) {
    console.error("Logout failed:", error.message);
    res.status(500).json({ success: false, message: "Unable to end the server session" });
  }
});

// Update all editable fields for one student.
app.put("/api/students/:id", async (req, res) => {
  const authenticatedStudent = await requireAuthenticatedStudent(req, res);
  if (!authenticatedStudent) return;
  const studentId = getStudentId(req.params.id);
  const { name, email, department, year } = req.body;

  if (!studentId) {
    return res.status(400).json({ success: false, message: "Invalid student ID" });
  }
  if (authenticatedStudent.student_id !== studentId) {
    return res.status(403).json({ success: false, message: "You can only update your own profile" });
  }
  if (!name || !email) {
    return res.status(400).json({
      success: false,
      message: "Name and email are required"
    });
  }

  const sql = "UPDATE students SET name = ?, email = ?, department = ?, year = ? WHERE student_id = ?";
  const values = [name, email, department || null, year || null, studentId];
  pool.query(sql, values, (error, result) => {
    if (error) return handleDatabaseError(error, res);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    res.status(200).json({
      success: true,
      student: {
        student_id: studentId,
        name,
        email,
        department: department || null,
        year: year || null
      }
    });
  });
});

// Delete one student by ID.
app.delete("/api/students/:id", async (req, res) => {
  const authenticatedStudent = await requireAuthenticatedStudent(req, res);
  if (!authenticatedStudent) return;
  const studentId = getStudentId(req.params.id);
  if (!studentId) {
    return res.status(400).json({ success: false, message: "Invalid student ID" });
  }
  if (authenticatedStudent.student_id !== studentId) {
    return res.status(403).json({ success: false, message: "You can only delete your own profile" });
  }

  pool.query("DELETE FROM students WHERE student_id = ?", [studentId], (error, result) => {
    if (error) return handleDatabaseError(error, res);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    res.status(200).json({
      success: true,
      message: "Student deleted successfully"
    });
  });
});

// Validate the fields shared by the create and update skill routes.
function getValidatedSkillData(body) {
  const { student_id, skill_name, skill_type, proficiency } = body;
  const studentId = getStudentId(student_id);

  if (!studentId || !skill_name || !skill_type) {
    return { error: "Student ID, skill name, and skill type are required" };
  }
  if (!["TEACH", "LEARN"].includes(skill_type)) {
    return { error: "Skill type must be TEACH or LEARN" };
  }

  return {
    studentId,
    skillName: skill_name,
    skillType: skill_type,
    proficiency: proficiency || null
  };
}

// Check the parent student before adding or moving a skill.
function verifyStudentExists(studentId, res, callback) {
  pool.query("SELECT student_id, name FROM students WHERE student_id = ?", [studentId], (error, students) => {
    if (error) return handleDatabaseError(error, res);
    if (students.length === 0) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    callback(students[0]);
  });
}

// Save a notification without preventing a completed exchange action from succeeding.
function createNotification(studentId, type, message, relatedRequestId, callback = () => {}) {
  const sql = `INSERT INTO notifications
               (student_id, type, message, related_request_id)
               VALUES (?, ?, ?, ?)`;
  pool.query(sql, [studentId, type, message, relatedRequestId], (error) => {
    if (error) console.error("Notification creation failed:", error.message);
    callback();
  });
}

// Add a skill that a student can teach or wants to learn.
app.post("/api/skills", async (req, res) => {
  const authenticatedStudent = await requireAuthenticatedStudent(req, res);
  if (!authenticatedStudent) return;
  const skill = getValidatedSkillData(req.body);
  if (skill.error) {
    return res.status(400).json({ success: false, message: skill.error });
  }
  if (authenticatedStudent.student_id !== skill.studentId) {
    return res.status(403).json({ success: false, message: "You can only add skills to your own profile" });
  }

  verifyStudentExists(skill.studentId, res, () => {
    const sql = "INSERT INTO skills (student_id, skill_name, skill_type, proficiency) VALUES (?, ?, ?, ?)";
    const values = [skill.studentId, skill.skillName, skill.skillType, skill.proficiency];

    pool.query(sql, values, (error, result) => {
      if (error) return handleDatabaseError(error, res);

      res.status(201).json({
        success: true,
        skill: {
          skill_id: result.insertId,
          student_id: skill.studentId,
          skill_name: skill.skillName,
          skill_type: skill.skillType,
          proficiency: skill.proficiency
        }
      });
    });
  });
});

// Get skills with the name of the student who added each one.
app.get("/api/skills", (req, res) => {
  const sql = `SELECT skills.*, students.name AS student_name
               FROM skills
               JOIN students ON skills.student_id = students.student_id
               ORDER BY skills.skill_id DESC`;

  pool.query(sql, (error, skills) => {
    if (error) return handleDatabaseError(error, res);

    res.status(200).json({ success: true, skills });
  });
});

// Get one skill by its ID.
app.get("/api/skills/:id", (req, res) => {
  const skillId = getStudentId(req.params.id);
  if (!skillId) {
    return res.status(400).json({ success: false, message: "Invalid skill ID" });
  }

  const sql = `SELECT skills.*, students.name AS student_name
               FROM skills
               JOIN students ON skills.student_id = students.student_id
               WHERE skills.skill_id = ?`;
  pool.query(sql, [skillId], (error, skills) => {
    if (error) return handleDatabaseError(error, res);
    if (skills.length === 0) {
      return res.status(404).json({ success: false, message: "Skill not found" });
    }

    res.status(200).json({ success: true, skill: skills[0] });
  });
});

// Update all editable fields for one skill.
app.put("/api/skills/:id", async (req, res) => {
  const authenticatedStudent = await requireAuthenticatedStudent(req, res);
  if (!authenticatedStudent) return;
  const skillId = getStudentId(req.params.id);
  const skill = getValidatedSkillData(req.body);

  if (!skillId) {
    return res.status(400).json({ success: false, message: "Invalid skill ID" });
  }
  if (skill.error) {
    return res.status(400).json({ success: false, message: skill.error });
  }
  if (authenticatedStudent.student_id !== skill.studentId) {
    return res.status(403).json({ success: false, message: "You can only update skills on your own profile" });
  }

  // Check the skill first so a missing skill always returns 404.
  pool.query("SELECT skill_id FROM skills WHERE skill_id = ?", [skillId], (error, skills) => {
    if (error) return handleDatabaseError(error, res);
    if (skills.length === 0) {
      return res.status(404).json({ success: false, message: "Skill not found" });
    }

    verifyStudentExists(skill.studentId, res, () => {
      const sql = "UPDATE skills SET student_id = ?, skill_name = ?, skill_type = ?, proficiency = ? WHERE skill_id = ?";
      const values = [skill.studentId, skill.skillName, skill.skillType, skill.proficiency, skillId];

      pool.query(sql, values, (updateError) => {
        if (updateError) return handleDatabaseError(updateError, res);

        res.status(200).json({
          success: true,
          skill: {
            skill_id: skillId,
            student_id: skill.studentId,
            skill_name: skill.skillName,
            skill_type: skill.skillType,
            proficiency: skill.proficiency
          }
        });
      });
    });
  });
});

// Delete one skill by ID.
app.delete("/api/skills/:id", async (req, res) => {
  const authenticatedStudent = await requireAuthenticatedStudent(req, res);
  if (!authenticatedStudent) return;
  const skillId = getStudentId(req.params.id);
  if (!skillId) {
    return res.status(400).json({ success: false, message: "Invalid skill ID" });
  }

  pool.query("DELETE FROM skills WHERE skill_id = ? AND student_id = ?", [skillId, authenticatedStudent.student_id], (error, result) => {
    if (error) return handleDatabaseError(error, res);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Skill not found" });
    }

    res.status(200).json({ success: true, message: "Skill deleted successfully" });
  });
});

// Validate optional scheduling data before it is saved with a request.
function getMeetingDetails(body) {
  const meetingLink = String(body.meeting_link || "").trim();
  const meetingDate = String(body.meeting_date || "").trim();
  const meetingTime = String(body.meeting_time || "").trim();

  if (meetingLink) {
    try {
      const url = new URL(meetingLink);
      const isGoogleMeet = url.protocol === "https:" && url.hostname === "meet.google.com" && /^\/[a-z]{3}-[a-z]{4}-[a-z]{3}\/?$/i.test(url.pathname);
      if (!isGoogleMeet) return { error: "Google Meet link must use the format https://meet.google.com/abc-defg-hij" };
    } catch {
      return { error: "Google Meet link must be a valid HTTPS URL" };
    }
  }

  if (meetingDate) {
    const parsedDate = new Date(`${meetingDate}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(meetingDate) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== meetingDate) {
      return { error: "Meeting date must be a valid date" };
    }
  }
  if (meetingTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(meetingTime)) {
    return { error: "Meeting time must use the HH:MM format" };
  }

  return { meetingLink: meetingLink || null, meetingDate: meetingDate || null, meetingTime: meetingTime || null };
}

// Validate the fields a sender is allowed to supply for a new exchange request.
function getValidatedExchangeCreateData(body) {
  const { sender_id, receiver_id, offered_skill, requested_skill } = body;
  const senderId = getStudentId(sender_id);
  const receiverId = getStudentId(receiver_id);

  if (!senderId || !receiverId || !offered_skill || !requested_skill) {
    return { error: "Sender ID, receiver ID, offered skill, and requested skill are required" };
  }
  if (senderId === receiverId) {
    return { error: "You cannot send an exchange request to yourself" };
  }

  const meetingDetails = getMeetingDetails(body);
  if (meetingDetails.error) return meetingDetails;

  return {
    senderId,
    receiverId,
    offeredSkill: offered_skill,
    requestedSkill: requested_skill,
    ...meetingDetails
  };
}

// Status changes are validated separately because the request details cannot be edited here.
function getRequestedExchangeStatus(body) {
  const status = String(body.status || "").trim().toUpperCase();
  if (!status) return { error: "A new exchange status is required" };
  if (!["ACCEPTED", "REJECTED", "COMPLETED"].includes(status)) {
    return { error: "Status must be ACCEPTED, REJECTED, or COMPLETED" };
  }
  return { status };
}

// Add a new request between two existing students.
app.post("/api/exchanges", async (req, res) => {
  const authenticatedStudent = await requireAuthenticatedStudent(req, res);
  if (!authenticatedStudent) return;
  const exchange = getValidatedExchangeCreateData(req.body);
  if (exchange.error) {
    return res.status(400).json({ success: false, message: exchange.error });
  }
  if (authenticatedStudent.student_id !== exchange.senderId) {
    return res.status(403).json({ success: false, message: "You can only send exchange requests from your own profile" });
  }

  verifyStudentExists(exchange.senderId, res, (sender) => {
    verifyStudentExists(exchange.receiverId, res, () => {
      const sql = `INSERT INTO exchange_requests
                   (sender_id, receiver_id, offered_skill, requested_skill, meeting_link, meeting_date, meeting_time, status)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
      const values = [
        exchange.senderId,
        exchange.receiverId,
        exchange.offeredSkill,
        exchange.requestedSkill,
        exchange.meetingLink,
        exchange.meetingDate,
        exchange.meetingTime,
        "PENDING"
      ];

      pool.query(sql, values, (error, result) => {
        if (error) return handleDatabaseError(error, res);

        const message = `You received a new exchange request from ${sender.name}.`;
        createNotification(exchange.receiverId, "NEW_EXCHANGE_REQUEST", message, result.insertId, () => {
          res.status(201).json({
            success: true,
            exchange: {
              request_id: result.insertId,
              sender_id: exchange.senderId,
              receiver_id: exchange.receiverId,
              offered_skill: exchange.offeredSkill,
              requested_skill: exchange.requestedSkill,
              meeting_link: exchange.meetingLink,
              meeting_date: exchange.meetingDate,
              meeting_time: exchange.meetingTime,
              status: "PENDING"
            }
          });
        });
      });
    });
  });
});

// Get all exchange requests with sender and receiver names.
app.get("/api/exchanges", (req, res) => {
  const sql = `SELECT exchange_requests.*, sender.name AS sender_name, receiver.name AS receiver_name
               FROM exchange_requests
               JOIN students AS sender ON exchange_requests.sender_id = sender.student_id
               JOIN students AS receiver ON exchange_requests.receiver_id = receiver.student_id
               ORDER BY exchange_requests.request_id DESC`;

  pool.query(sql, (error, exchanges) => {
    if (error) return handleDatabaseError(error, res);

    res.status(200).json({ success: true, exchanges });
  });
});

// Get one exchange request by ID.
app.get("/api/exchanges/:id", (req, res) => {
  const requestId = getStudentId(req.params.id);
  if (!requestId) {
    return res.status(400).json({ success: false, message: "Invalid exchange request ID" });
  }

  const sql = `SELECT exchange_requests.*, sender.name AS sender_name, receiver.name AS receiver_name
               FROM exchange_requests
               JOIN students AS sender ON exchange_requests.sender_id = sender.student_id
               JOIN students AS receiver ON exchange_requests.receiver_id = receiver.student_id
               WHERE exchange_requests.request_id = ?`;
  pool.query(sql, [requestId], (error, exchanges) => {
    if (error) return handleDatabaseError(error, res);
    if (exchanges.length === 0) {
      return res.status(404).json({ success: false, message: "Exchange request not found" });
    }

    res.status(200).json({ success: true, exchange: exchanges[0] });
  });
});

// Change a request status only through the approved workflow.
app.put("/api/exchanges/:id", async (req, res) => {
  const authenticatedStudent = await requireAuthenticatedStudent(req, res);
  if (!authenticatedStudent) return;
  const requestId = getStudentId(req.params.id);
  const requestedStatus = getRequestedExchangeStatus(req.body);

  if (!requestId) {
    return res.status(400).json({ success: false, message: "Invalid exchange request ID" });
  }
  if (requestedStatus.error) {
    return res.status(400).json({ success: false, message: requestedStatus.error });
  }

  pool.query("SELECT request_id, sender_id, receiver_id, offered_skill, requested_skill, meeting_link, meeting_date, meeting_time, status FROM exchange_requests WHERE request_id = ?", [requestId], (error, requests) => {
    if (error) return handleDatabaseError(error, res);
    if (requests.length === 0) {
      return res.status(404).json({ success: false, message: "Exchange request not found" });
    }

    const previousRequest = requests[0];
    const isSender = authenticatedStudent.student_id === previousRequest.sender_id;
    const isReceiver = authenticatedStudent.student_id === previousRequest.receiver_id;
    if (!isSender && !isReceiver) {
      return res.status(403).json({ success: false, message: "You are not part of this exchange request" });
    }
    const nextStatus = requestedStatus.status;
    const isReceiverDecision = previousRequest.status === "PENDING" && ["ACCEPTED", "REJECTED"].includes(nextStatus);
    const isParticipantCompletion = previousRequest.status === "ACCEPTED" && nextStatus === "COMPLETED";

    if (isReceiverDecision && !isReceiver) {
      return res.status(403).json({ success: false, message: "Only the receiving student can accept or reject this request" });
    }
    if (!isReceiverDecision && !isParticipantCompletion) {
      return res.status(400).json({ success: false, message: "This exchange status change is not allowed" });
    }

    pool.query("UPDATE exchange_requests SET status = ? WHERE request_id = ?", [nextStatus, requestId], (updateError) => {
      if (updateError) return handleDatabaseError(updateError, res);

      const notifyStudentId = nextStatus === "COMPLETED"
        ? (isSender ? previousRequest.receiver_id : previousRequest.sender_id)
        : previousRequest.sender_id;
      const message = nextStatus === "COMPLETED"
        ? "Your accepted exchange was marked completed."
        : `Your exchange request was ${nextStatus.toLowerCase()}.`;

      createNotification(notifyStudentId, `EXCHANGE_${nextStatus}`, message, requestId, () => {
        res.status(200).json({
          success: true,
          exchange: {
            request_id: previousRequest.request_id,
            sender_id: previousRequest.sender_id,
            receiver_id: previousRequest.receiver_id,
            offered_skill: previousRequest.offered_skill,
            requested_skill: previousRequest.requested_skill,
            meeting_link: previousRequest.meeting_link,
            meeting_date: previousRequest.meeting_date,
            meeting_time: previousRequest.meeting_time,
            status: nextStatus
          }
        });
      });
    });
  });
});

// Delete one exchange request by ID.
app.delete("/api/exchanges/:id", async (req, res) => {
  const authenticatedStudent = await requireAuthenticatedStudent(req, res);
  if (!authenticatedStudent) return;
  const requestId = getStudentId(req.params.id);
  if (!requestId) {
    return res.status(400).json({ success: false, message: "Invalid exchange request ID" });
  }

  pool.query("DELETE FROM exchange_requests WHERE request_id = ? AND sender_id = ?", [requestId, authenticatedStudent.student_id], (error, result) => {
    if (error) return handleDatabaseError(error, res);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Exchange request not found" });
    }

    res.status(200).json({ success: true, message: "Exchange request deleted successfully" });
  });
});

// Get the unread notification count for one selected student profile.
app.get("/api/notifications/:studentId/unread-count", async (req, res) => {
  const authenticatedStudent = await requireAuthenticatedStudent(req, res);
  if (!authenticatedStudent) return;
  const studentId = getStudentId(req.params.studentId);
  if (!studentId) {
    return res.status(400).json({ success: false, message: "Invalid student ID" });
  }
  if (authenticatedStudent.student_id !== studentId) {
    return res.status(403).json({ success: false, message: "You can only view your own notifications" });
  }

  pool.query("SELECT COUNT(*) AS unread_count FROM notifications WHERE student_id = ? AND is_read = 0", [studentId], (error, rows) => {
    if (error) return handleDatabaseError(error, res);
    res.status(200).json({ success: true, unread_count: rows[0].unread_count });
  });
});

// Get newest notifications first for the currently selected student profile.
app.get("/api/notifications/:studentId", async (req, res) => {
  const authenticatedStudent = await requireAuthenticatedStudent(req, res);
  if (!authenticatedStudent) return;
  const studentId = getStudentId(req.params.studentId);
  if (!studentId) {
    return res.status(400).json({ success: false, message: "Invalid student ID" });
  }
  if (authenticatedStudent.student_id !== studentId) {
    return res.status(403).json({ success: false, message: "You can only view your own notifications" });
  }

  const sql = `SELECT notification_id, student_id, type, message, related_request_id, is_read, created_at
               FROM notifications
               WHERE student_id = ?
               ORDER BY created_at DESC, notification_id DESC`;
  pool.query(sql, [studentId], (error, notifications) => {
    if (error) return handleDatabaseError(error, res);
    res.status(200).json({ success: true, notifications });
  });
});

// Mark one notification as read only when it belongs to the supplied student profile.
app.patch("/api/notifications/:notificationId/read", async (req, res) => {
  const authenticatedStudent = await requireAuthenticatedStudent(req, res);
  if (!authenticatedStudent) return;
  const notificationId = getStudentId(req.params.notificationId);
  const studentId = getStudentId(req.body.student_id);
  if (!notificationId || !studentId) {
    return res.status(400).json({ success: false, message: "A valid notification ID and student ID are required" });
  }
  if (authenticatedStudent.student_id !== studentId) {
    return res.status(403).json({ success: false, message: "You can only update your own notifications" });
  }

  const sql = "UPDATE notifications SET is_read = 1 WHERE notification_id = ? AND student_id = ?";
  pool.query(sql, [notificationId, studentId], (error, result) => {
    if (error) return handleDatabaseError(error, res);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Notification not found for this student" });
    }

    res.status(200).json({ success: true, message: "Notification marked as read" });
  });
});

// Mark all notifications as read for one selected student profile.
app.patch("/api/notifications/:studentId/read-all", async (req, res) => {
  const authenticatedStudent = await requireAuthenticatedStudent(req, res);
  if (!authenticatedStudent) return;
  const studentId = getStudentId(req.params.studentId);
  const bodyStudentId = getStudentId(req.body.student_id);
  if (!studentId || studentId !== bodyStudentId) {
    return res.status(400).json({ success: false, message: "Student ID does not match the selected profile" });
  }
  if (authenticatedStudent.student_id !== studentId) {
    return res.status(403).json({ success: false, message: "You can only update your own notifications" });
  }

  pool.query("UPDATE notifications SET is_read = 1 WHERE student_id = ? AND is_read = 0", [studentId], (error) => {
    if (error) return handleDatabaseError(error, res);
    res.status(200).json({ success: true, message: "All notifications marked as read" });
  });
});

// Return a clear JSON response for unexpected server errors.
app.use((error, req, res, next) => {
  console.error("Server error:", error);
  res.status(500).json({
    success: false,
    message: "An unexpected server error occurred"
  });
});

app.listen(PORT, () => {
  console.log(`StudentSkillExchange API is running on port ${PORT}`);
});
