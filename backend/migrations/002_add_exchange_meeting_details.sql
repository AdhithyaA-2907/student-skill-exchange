-- Adds optional scheduling details without changing or removing existing exchanges.
-- The information_schema checks make this migration safe to run more than once.
SET @meeting_link_sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exchange_requests' AND COLUMN_NAME = 'meeting_link') = 0,
  'ALTER TABLE exchange_requests ADD COLUMN meeting_link VARCHAR(255) NULL',
  'SELECT 1'
);
PREPARE add_meeting_link FROM @meeting_link_sql;
EXECUTE add_meeting_link;
DEALLOCATE PREPARE add_meeting_link;

SET @meeting_date_sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exchange_requests' AND COLUMN_NAME = 'meeting_date') = 0,
  'ALTER TABLE exchange_requests ADD COLUMN meeting_date DATE NULL',
  'SELECT 1'
);
PREPARE add_meeting_date FROM @meeting_date_sql;
EXECUTE add_meeting_date;
DEALLOCATE PREPARE add_meeting_date;

SET @meeting_time_sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exchange_requests' AND COLUMN_NAME = 'meeting_time') = 0,
  'ALTER TABLE exchange_requests ADD COLUMN meeting_time TIME NULL',
  'SELECT 1'
);
PREPARE add_meeting_time FROM @meeting_time_sql;
EXECUTE add_meeting_time;
DEALLOCATE PREPARE add_meeting_time;
