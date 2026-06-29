CREATE TABLE IF NOT EXISTS `rotation_trip` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`start_ts` integer NOT NULL,
	`end_ts` integer NOT NULL,
	`direction` integer NOT NULL,
	`estimated_theta_max` real,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_rotation_trip_ts` ON `rotation_trip` (`start_ts`,`end_ts`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `scan_pass` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`rotation_trip_id` integer,
	`start_ts` integer NOT NULL,
	`end_ts` integer NOT NULL,
	`scanner_direction` integer NOT NULL,
	`pulse_min` integer NOT NULL,
	`pulse_max` integer NOT NULL,
	`valid_ratio` real DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`rotation_trip_id`) REFERENCES `rotation_trip`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_scan_pass_ts` ON `scan_pass` (`start_ts`,`end_ts`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_scan_pass_rt` ON `scan_pass` (`rotation_trip_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `scan_pass_summary` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scan_pass_id` integer NOT NULL,
	`profile_bins_json` text DEFAULT '[]' NOT NULL,
	`quality_score` real DEFAULT 0 NOT NULL,
	`candidate_fan_indices_json` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`scan_pass_id`) REFERENCES `scan_pass`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_scan_pass_summary_sp` ON `scan_pass_summary` (`scan_pass_id`);
