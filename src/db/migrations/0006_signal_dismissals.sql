CREATE TABLE `signal_dismissals` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`signal_key` text NOT NULL,
	`dismissed_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_signal_dismissals_key" CHECK(length(trim("signal_dismissals"."signal_key")) > 0 AND length("signal_dismissals"."signal_key") <= 200)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_signal_dismissals_owner_key` ON `signal_dismissals` (`owner_id`,`signal_key`);