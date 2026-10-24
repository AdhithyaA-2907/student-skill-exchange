-- Adds RBAC foundation without altering credentials or existing student records.
-- Existing rows receive the safe default role: student.
SET @role_sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'students' AND COLUMN_NAME = 'role') = 0,
  'ALTER TABLE students ADD COLUMN role ENUM(''student'', ''admin'') NOT NULL DEFAULT ''student'' AFTER password_hash',
  'SELECT 1'
);
PREPARE add_student_role FROM @role_sql;
EXECUTE add_student_role;
DEALLOCATE PREPARE add_student_role;
