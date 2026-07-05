ALTER TABLE `scan_pass` DROP COLUMN `rotation_trip_id`;
--> statement-breakpoint
DROP INDEX IF EXISTS `idx_scan_pass_rt`;
