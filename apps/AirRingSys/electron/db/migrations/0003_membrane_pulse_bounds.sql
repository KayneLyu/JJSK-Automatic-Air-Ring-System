-- 0003: Add membrane_pulse_min/max to scan_pass (双峰边沿检测的膜内脉冲范围)
-- 仅 status=complete 的扫描趟有值，rejected 为 NULL；历史数据不回填。
--> statement-breakpoint
ALTER TABLE `scan_pass` ADD COLUMN `membrane_pulse_min` integer;
--> statement-breakpoint
ALTER TABLE `scan_pass` ADD COLUMN `membrane_pulse_max` integer;
