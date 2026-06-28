ALTER TABLE point_logs DROP CONSTRAINT point_logs_source_check;
ALTER TABLE point_logs ADD CONSTRAINT point_logs_source_check
  CHECK (source IN ('verify', 'host', 'dice'));
