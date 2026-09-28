CREATE TABLE `earmark_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`earmark_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`owner_id`,`earmark_id`) REFERENCES `earmarks`(`owner_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_earmark_entries_amount" CHECK(typeof("earmark_entries"."amount_minor") = 'integer' AND "earmark_entries"."amount_minor" <> 0)
);
--> statement-breakpoint
CREATE INDEX `ix_earmark_entries_earmark` ON `earmark_entries` (`owner_id`,`earmark_id`);--> statement-breakpoint
CREATE TABLE `earmarks` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`item_id` text NOT NULL,
	`account_id` text NOT NULL,
	`priority` integer NOT NULL,
	`ended_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`owner_id`,`item_id`) REFERENCES `protected_money_items`(`owner_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`owner_id`,`account_id`) REFERENCES `accounts`(`owner_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_earmarks_priority" CHECK(typeof("earmarks"."priority") = 'integer' AND "earmarks"."priority" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_earmarks_owner_id` ON `earmarks` (`owner_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_earmarks_owner_priority` ON `earmarks` (`owner_id`,`priority`);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_earmarks_active_item_account` ON `earmarks` (`item_id`,`account_id`) WHERE "earmarks"."ended_at" IS NULL;--> statement-breakpoint
CREATE INDEX `ix_earmarks_account_priority` ON `earmarks` (`owner_id`,`account_id`,`priority`);--> statement-breakpoint
CREATE TABLE `protected_money_items` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`target_minor` integer,
	`archived_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_protected_money_items_name" CHECK(length(trim("protected_money_items"."name")) > 0),
	CONSTRAINT "ck_protected_money_items_target" CHECK("protected_money_items"."target_minor" IS NULL OR (typeof("protected_money_items"."target_minor") = 'integer' AND "protected_money_items"."target_minor" > 0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_protected_money_items_owner_id` ON `protected_money_items` (`owner_id`,`id`);