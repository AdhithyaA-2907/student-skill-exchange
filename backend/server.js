// Load values from the local .env file before using process.env.
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mysql = require("mysql2");

const app = express();
const PORT = process.env.PORT || 5000;

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

// Return a consistent message when an email already belongs to another student.
function handleDatabaseError(error, res) {
  console.error("Database query failed:", error.message);

  if (error.code === "ER_DUP_ENTRY") {
    return res.status(409).json({
      success: false,
      message: "A student with this email already exists"
    });
  }

  return res.status(500).json({
    success: false,
    message: "Database operation failed"
  });
}

// Create a new student.
app.post("/api/students", (req, res) => {
  const { name, email, department, year } = req.body;

  if (!name || !email) {
    return res.status(400).json({
      success: false,
      message: "Name and email are required"
    });
  }

  const sql = "INSERT INTO students (name, email, department, year) VALUES (?, ?, ?, ?)";
  pool.query(sql, [name, email, department || null, year || null], (error, result) => {
    if (error) return handleDatabaseError(error, res);

    res.status(201).json({
      success: true,
      student: {
        student_id: result.insertId,
        name,
        email,
        department: department || null,
        year: year || null
      }
    });
  });
});

// Get every student.
app.get("/api/students", (req, res) => {
  pool.query("SELECT * FROM students", (error, students) => {
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

  pool.query("SELECT * FROM students WHERE student_id = ?", [studentId], (error, students) => {
    if (error) return handleDatabaseError(error, res);
    if (students.length === 0) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    res.status(200).json({ success: true, student: students[0] });
  });
});

// Update all editable fields for one student.
app.put("/api/students/:id", (req, res) => {
  const studentId = getStudentId(req.params.id);
  const { name, email, department, year } = req.body;

  if (!studentId) {
    return res.status(400).json({ success: false, message: "Invalid student ID" });
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
app.delete("/api/students/:id", (req, res) => {
  const studentId = getStudentId(req.params.id);
  if (!studentId) {
    return res.status(400).json({ success: false, message: "Invalid student ID" });
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
  pool.query("SELECT student_id FROM students WHERE student_id = ?", [studentId], (error, students) => {
    if (error) return handleDatabaseError(error, res);
    if (students.length === 0) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    callback();
  });
}

// Add a skill that a student can teach or wants to learn.
app.post("/api/skills", (req, res) => {
  const skill = getValidatedSkillData(req.body);
  if (skill.error) {
    return res.status(400).json({ success: false, message: skill.error });
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
app.put("/api/skills/:id", (req, res) => {
  const skillId = getStudentId(req.params.id);
  const skill = getValidatedSkillData(req.body);

  if (!skillId) {
    return res.status(400).json({ success: false, message: "Invalid skill ID" });
  }
  if (skill.error) {
    return res.status(400).json({ success: false, message: skill.error });
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
app.delete("/api/skills/:id", (req, res) => {
  const skillId = getStudentId(req.params.id);
  if (!skillId) {
    return res.status(400).json({ success: false, message: "Invalid skill ID" });
  }

  pool.query("DELETE FROM skills WHERE skill_id = ?", [skillId], (error, result) => {
    if (error) return handleDatabaseError(error, res);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Skill not found" });
    }

    res.status(200).json({ success: true, message: "Skill deleted successfully" });
  });
});

// Validate the fields needed to create or update an exchange request.
function getValidatedExchangeData(body) {
  const { sender_id, receiver_id, offered_skill, requested_skill, status } = body;
  const senderId = getStudentId(sender_id);
  const receiverId = getStudentId(receiver_id);
  const exchangeStatus = status || "PENDING";
  const allowedStatuses = ["PENDING", "ACCEPTED", "REJECTED", "COMPLETED"];

  if (!senderId || !receiverId || !offered_skill || !requested_skill) {
    return { error: "Sender ID, receiver ID, offered skill, and requested skill are required" };
  }
  if (!allowedStatuses.includes(exchangeStatus)) {
    return { error: "Status must be PENDING, ACCEPTED, REJECTED, or COMPLETED" };
  }

  return {
    senderId,
    receiverId,
    offeredSkill: offered_skill,
    requestedSkill: requested_skill,
    status: exchangeStatus
  };
}

// Add a new request between two existing students.
app.post("/api/exchanges", (req, res) => {
  const exchange = getValidatedExchangeData(req.body);
  if (exchange.error) {
    return res.status(400).json({ success: false, message: exchange.error });
  }

  verifyStudentExists(exchange.senderId, res, () => {
    verifyStudentExists(exchange.receiverId, res, () => {
      const sql = `INSERT INTO exchange_requests
                   (sender_id, receiver_id, offered_skill, requested_skill, status)
                   VALUES (?, ?, ?, ?, ?)`;
      const values = [
        exchange.senderId,
        exchange.receiverId,
        exchange.offeredSkill,
        exchange.requestedSkill,
        exchange.status
      ];

      pool.query(sql, values, (error, result) => {
        if (error) return handleDatabaseError(error, res);

        res.status(201).json({
          success: true,
          exchange: {
            request_id: result.insertId,
            sender_id: exchange.senderId,
            receiver_id: exchange.receiverId,
            offered_skill: exchange.offeredSkill,
            requested_skill: exchange.requestedSkill,
            status: exchange.status
          }
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

// Update all fields of one exchange request.
app.put("/api/exchanges/:id", (req, res) => {
  const requestId = getStudentId(req.params.id);
  const exchange = getValidatedExchangeData(req.body);

  if (!requestId) {
    return res.status(400).json({ success: false, message: "Invalid exchange request ID" });
  }
  if (exchange.error) {
    return res.status(400).json({ success: false, message: exchange.error });
  }

  // Check the request before checking its referenced students.
  pool.query("SELECT request_id FROM exchange_requests WHERE request_id = ?", [requestId], (error, requests) => {
    if (error) return handleDatabaseError(error, res);
    if (requests.length === 0) {
      return res.status(404).json({ success: false, message: "Exchange request not found" });
    }

    verifyStudentExists(exchange.senderId, res, () => {
      verifyStudentExists(exchange.receiverId, res, () => {
        const sql = `UPDATE exchange_requests
                     SET sender_id = ?, receiver_id = ?, offered_skill = ?, requested_skill = ?, status = ?
                     WHERE request_id = ?`;
        const values = [
          exchange.senderId,
          exchange.receiverId,
          exchange.offeredSkill,
          exchange.requestedSkill,
          exchange.status,
          requestId
        ];

        pool.query(sql, values, (updateError) => {
          if (updateError) return handleDatabaseError(updateError, res);

          res.status(200).json({
            success: true,
            exchange: {
              request_id: requestId,
              sender_id: exchange.senderId,
              receiver_id: exchange.receiverId,
              offered_skill: exchange.offeredSkill,
              requested_skill: exchange.requestedSkill,
              status: exchange.status
            }
          });
        });
      });
    });
  });
});

// Delete one exchange request by ID.
app.delete("/api/exchanges/:id", (req, res) => {
  const requestId = getStudentId(req.params.id);
  if (!requestId) {
    return res.status(400).json({ success: false, message: "Invalid exchange request ID" });
  }

  pool.query("DELETE FROM exchange_requests WHERE request_id = ?", [requestId], (error, result) => {
    if (error) return handleDatabaseError(error, res);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Exchange request not found" });
    }

    res.status(200).json({ success: true, message: "Exchange request deleted successfully" });
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
