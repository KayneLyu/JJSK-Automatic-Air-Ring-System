-- 0002: Add pos1 (辊编码器), remove airAD/gain (标定常量移至配置), drop roller_raw (未使用)
--> statement-breakpoint
ALTER TABLE `thickness_raw` ADD COLUMN `pos1` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `thickness_raw` DROP COLUMN `airAD`;
--> statement-breakpoint
ALTER TABLE `thickness_raw` DROP COLUMN `gain`;
--> statement-breakpoint
DROP TABLE IF EXISTS `roller_raw`;
