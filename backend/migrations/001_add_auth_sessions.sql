-- Persistent server-side sessions for SkillSwap authentication.
-- Safe to run once on the existing restored Railway database.
-- No existing application table or data is changed.
CREATE TABLE IF NOT EXISTS auth_sessions (
  session_id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
  INDEX idx_auth_sessions_token_expiry (token_hash, expires_at),
  INDEX idx_auth_sessions_student (student_id)
);
