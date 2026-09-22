CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`currency` text NOT NULL,
	`included_in_available` integer NOT NULL,
	`opened_on` text NOT NULL,
	`archived_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_accounts_type" CHECK("accounts"."type" IN ('cash', 'bank', 'mobile_wallet', 'savings', 'credit_card')),
	CONSTRAINT "ck_accounts_currency" CHECK(length("accounts"."currency") = 3),
	CONSTRAINT "ck_accounts_included_bool" CHECK("accounts"."included_in_available" IN (0, 1)),
	CONSTRAINT "ck_accounts_name" CHECK(length(trim("accounts"."name")) > 0),
	CONSTRAINT "ck_accounts_opened_on" CHECK("accounts"."opened_on" = date("accounts"."opened_on"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_accounts_owner_id` ON `accounts` (`owner_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_accounts_owner_name` ON `accounts` (`owner_id`,lower("name"));--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`archived_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_categories_kind" CHECK("categories"."kind" IN ('income', 'expense')),
	CONSTRAINT "ck_categories_name" CHECK(length(trim("categories"."name")) > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_categories_owner_id` ON `categories` (`owner_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_categories_owner_kind_name` ON `categories` (`owner_id`,`kind`,lower("name"));--> statement-breakpoint
CREATE TABLE `owners` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`base_currency` text NOT NULL,
	`time_zone` text NOT NULL,
	`next_transaction_sequence` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "ck_owners_currency" CHECK(length("owners"."base_currency") = 3),
	CONSTRAINT "ck_owners_sequence" CHECK("owners"."next_transaction_sequence" >= 1)
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`type` text NOT NULL,
	`occurred_on` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`account_id` text NOT NULL,
	`counter_account_id` text,
	`category_id` text,
	`refund_of_id` text,
	`group_id` text,
	`description` text,
	`note` text,
	`deleted_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`owner_id`,`account_id`) REFERENCES `accounts`(`owner_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`owner_id`,`counter_account_id`) REFERENCES `accounts`(`owner_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`owner_id`,`category_id`) REFERENCES `categories`(`owner_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`owner_id`,`refund_of_id`) REFERENCES `transactions`(`owner_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_transactions_type" CHECK("transactions"."type" IN ('income', 'expense', 'refund', 'transfer', 'opening_balance', 'adjustment')),
	CONSTRAINT "ck_transactions_amount_integer" CHECK(typeof("transactions"."amount_minor") = 'integer'),
	CONSTRAINT "ck_transactions_occurred_on" CHECK("transactions"."occurred_on" = date("transactions"."occurred_on")),
	CONSTRAINT "ck_transactions_sequence" CHECK("transactions"."sequence" >= 1),
	CONSTRAINT "ck_transactions_income" CHECK("transactions"."type" <> 'income' OR ("transactions"."amount_minor" > 0 AND "transactions"."category_id" IS NOT NULL AND "transactions"."counter_account_id" IS NULL AND "transactions"."refund_of_id" IS NULL)),
	CONSTRAINT "ck_transactions_expense" CHECK("transactions"."type" <> 'expense' OR ("transactions"."amount_minor" < 0 AND "transactions"."category_id" IS NOT NULL AND "transactions"."counter_account_id" IS NULL AND "transactions"."refund_of_id" IS NULL)),
	CONSTRAINT "ck_transactions_refund" CHECK("transactions"."type" <> 'refund' OR ("transactions"."amount_minor" > 0 AND "transactions"."category_id" IS NOT NULL AND "transactions"."counter_account_id" IS NULL)),
	CONSTRAINT "ck_transactions_transfer" CHECK("transactions"."type" <> 'transfer' OR ("transactions"."amount_minor" < 0 AND "transactions"."counter_account_id" IS NOT NULL AND "transactions"."counter_account_id" <> "transactions"."account_id" AND "transactions"."category_id" IS NULL AND "transactions"."refund_of_id" IS NULL)),
	CONSTRAINT "ck_transactions_opening_adjustment" CHECK("transactions"."type" NOT IN ('opening_balance', 'adjustment') OR ("transactions"."amount_minor" <> 0 AND "transactions"."category_id" IS NULL AND "transactions"."counter_account_id" IS NULL AND "transactions"."refund_of_id" IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_transactions_owner_id` ON `transactions` (`owner_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_transactions_owner_sequence` ON `transactions` (`owner_id`,`sequence`);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_transactions_active_opening_balance` ON `transactions` (`account_id`) WHERE "transactions"."type" = 'opening_balance' AND "transactions"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `ix_transactions_account_date` ON `transactions` (`owner_id`,`account_id`,`occurred_on`);--> statement-breakpoint
CREATE INDEX `ix_transactions_counter_account_date` ON `transactions` (`owner_id`,`counter_account_id`,`occurred_on`) WHERE "transactions"."counter_account_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `ix_transactions_owner_order` ON `transactions` (`owner_id`,`occurred_on`,`sequence`);--> statement-breakpoint
CREATE INDEX `ix_transactions_category_date` ON `transactions` (`owner_id`,`category_id`,`occurred_on`);--> statement-breakpoint
CREATE INDEX `ix_transactions_group` ON `transactions` (`group_id`) WHERE "transactions"."group_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `ix_transactions_refund_of` ON `transactions` (`owner_id`,`refund_of_id`) WHERE "transactions"."refund_of_id" IS NOT NULL;