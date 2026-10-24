-- Add optional TOTP MFA fields without changing existing accounts or records.
-- Every existing account starts with MFA disabled and no configured secret.
SET @totp_secret_sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'students' AND COLUMN_NAME = 'totp_secret') = 0,
  'ALTER TABLE students ADD COLUMN totp_secret VARCHAR(64) NULL AFTER role',
  'SELECT 1'
);
PREPARE add_totp_secret FROM @totp_secret_sql;
EXECUTE add_totp_secret;
DEALLOCATE PREPARE add_totp_secret;

SET @totp_enabled_sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'students' AND COLUMN_NAME = 'totp_enabled') = 0,
  'ALTER TABLE students ADD COLUMN totp_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER totp_secret',
  'SELECT 1'
);
PREPARE add_totp_enabled FROM @totp_enabled_sql;
EXECUTE add_totp_enabled;
DEALLOCATE PREPARE add_totp_enabled;
