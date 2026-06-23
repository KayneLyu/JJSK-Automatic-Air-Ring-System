DROP TABLE IF EXISTS `frame_data`;
DROP TABLE IF EXISTS `frame`;
CREATE TABLE `air_ring_raw` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` integer NOT NULL,
	`channelHeats` text DEFAULT '[]' NOT NULL,
	`isAuto` integer DEFAULT 0 NOT NULL,
	`sigma` real DEFAULT 0 NOT NULL,
	`corrR` real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_air_ring_raw_ts` ON `air_ring_raw` (`timestamp`);--> statement-breakpoint
CREATE TABLE `roller_raw` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` integer NOT NULL,
	`speed` real DEFAULT 0 NOT NULL,
	`position` real DEFAULT 0 NOT NULL,
	`direction` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_roller_raw_ts` ON `roller_raw` (`timestamp`);--> statement-breakpoint
CREATE TABLE `rotation_raw` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` integer NOT NULL,
	`forwardRotation` integer DEFAULT 0 NOT NULL,
	`reverseRotation` integer DEFAULT 0 NOT NULL,
	`motorFrequency` real DEFAULT 0 NOT NULL,
	`forwardDirChange` integer DEFAULT 0 NOT NULL,
	`reverseDirChange` integer DEFAULT 0 NOT NULL,
	`reset` integer DEFAULT 0 NOT NULL,
	`heats` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_rotation_raw_ts` ON `rotation_raw` (`timestamp`);--> statement-breakpoint
CREATE TABLE `thickness_raw` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` integer NOT NULL,
	`pulse` integer NOT NULL,
	`ad` real NOT NULL,
	`source` text DEFAULT 'adbox' NOT NULL,
	`airAD` real DEFAULT 0 NOT NULL,
	`gain` real DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_thickness_raw_ts` ON `thickness_raw` (`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_thickness_raw_ts_pulse` ON `thickness_raw` (`timestamp`,`pulse`);