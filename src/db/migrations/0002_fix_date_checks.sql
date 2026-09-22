-- Fix: ck_accounts_opened_on / ck_transactions_occurred_on accepted malformed dates.
-- date('2026-9-10') is NULL, so `x = date(x)` was NULL, and a NULL CHECK result
-- passes. The corrected CHECK requires date(x) IS NOT NULL.
--
-- SQLite changes a CHECK only by rebuilding the table. This is drizzle-kit's
-- generated rebuild, corrected by hand (docs/tech-stack.md §9):
--   * foreign-key enforcement is switched off by the migration runner
--     (src/db/migrate.ts), because PRAGMA foreign_keys is a no-op inside the
--     migration transaction — so the generated PRAGMA lines were removed;
--   * the views that read `transactions` are dropped and recreated around the
--     rebuild (renaming a table while a view references a missing table fails);
--   * the lower("name") expression index is written as an expression (drizzle-kit
--     quoted it as if it were a column name);
--   * a guard at the end aborts the whole migration if any foreign key is broken.
-- The drizzle-kit snapshot for 0002 is kept, so `npm run db:check` stays accurate.

DROP VIEW `account_entries`;
--> statement-breakpoint
DROP VIEW `active_transactions`;
--> statement-breakpoint

-- accounts ------------------------------------------------------------------
CREATE TABLE `__new_accounts` (
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
	CONSTRAINT "ck_accounts_type" CHECK("__new_accounts"."type" IN ('cash', 'bank', 'mobile_wallet', 'savings', 'credit_card')),
	CONSTRAINT "ck_accounts_currency" CHECK(length("__new_accounts"."currency") = 3),
	CONSTRAINT "ck_accounts_included_bool" CHECK("__new_accounts"."included_in_available" IN (0, 1)),
	CONSTRAINT "ck_accounts_name" CHECK(length(trim("__new_accounts"."name")) > 0),
	CONSTRAINT "ck_accounts_opened_on" CHECK(date("__new_accounts"."opened_on") IS NOT NULL AND "__new_accounts"."opened_on" = date("__new_accounts"."opened_on"))
);
--> statement-breakpoint
INSERT INTO `__new_accounts`("id", "owner_id", "name", "type", "currency", "included_in_available", "opened_on", "archived_at", "created_at", "updated_at")
SELECT "id", "owner_id", "name", "type", "currency", "included_in_available", "opened_on", "archived_at", "created_at", "updated_at" FROM `accounts`;
--> statement-breakpoint
DROP TABLE `accounts`;
--> statement-breakpoint
ALTER TABLE `__new_accounts` RENAME TO `accounts`;
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_accounts_owner_id` ON `accounts` (`owner_id`,`id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_accounts_owner_name` ON `accounts` (`owner_id`,lower("name"));
--> statement-breakpoint

-- transactions --------------------------------------------------------------
CREATE TABLE `__new_transactions` (
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
	CONSTRAINT "ck_transactions_type" CHECK("__new_transactions"."type" IN ('income', 'expense', 'refund', 'transfer', 'opening_balance', 'adjustment')),
	CONSTRAINT "ck_transactions_amount_integer" CHECK(typeof("__new_transactions"."amount_minor") = 'integer'),
	CONSTRAINT "ck_transactions_occurred_on" CHECK(date("__new_transactions"."occurred_on") IS NOT NULL AND "__new_transactions"."occurred_on" = date("__new_transactions"."occurred_on")),
	CONSTRAINT "ck_transactions_sequence" CHECK("__new_transactions"."sequence" >= 1),
	CONSTRAINT "ck_transactions_income" CHECK("__new_transactions"."type" <> 'income' OR ("__new_transactions"."amount_minor" > 0 AND "__new_transactions"."category_id" IS NOT NULL AND "__new_transactions"."counter_account_id" IS NULL AND "__new_transactions"."refund_of_id" IS NULL)),
	CONSTRAINT "ck_transactions_expense" CHECK("__new_transactions"."type" <> 'expense' OR ("__new_transactions"."amount_minor" < 0 AND "__new_transactions"."category_id" IS NOT NULL AND "__new_transactions"."counter_account_id" IS NULL AND "__new_transactions"."refund_of_id" IS NULL)),
	CONSTRAINT "ck_transactions_refund" CHECK("__new_transactions"."type" <> 'refund' OR ("__new_transactions"."amount_minor" > 0 AND "__new_transactions"."category_id" IS NOT NULL AND "__new_transactions"."counter_account_id" IS NULL)),
	CONSTRAINT "ck_transactions_transfer" CHECK("__new_transactions"."type" <> 'transfer' OR ("__new_transactions"."amount_minor" < 0 AND "__new_transactions"."counter_account_id" IS NOT NULL AND "__new_transactions"."counter_account_id" <> "__new_transactions"."account_id" AND "__new_transactions"."category_id" IS NULL AND "__new_transactions"."refund_of_id" IS NULL)),
	CONSTRAINT "ck_transactions_opening_adjustment" CHECK("__new_transactions"."type" NOT IN ('opening_balance', 'adjustment') OR ("__new_transactions"."amount_minor" <> 0 AND "__new_transactions"."category_id" IS NULL AND "__new_transactions"."counter_account_id" IS NULL AND "__new_transactions"."refund_of_id" IS NULL))
);
--> statement-breakpoint
INSERT INTO `__new_transactions`("id", "owner_id", "sequence", "type", "occurred_on", "amount_minor", "account_id", "counter_account_id", "category_id", "refund_of_id", "group_id", "description", "note", "deleted_at", "created_at", "updated_at")
SELECT "id", "owner_id", "sequence", "type", "occurred_on", "amount_minor", "account_id", "counter_account_id", "category_id", "refund_of_id", "group_id", "description", "note", "deleted_at", "created_at", "updated_at" FROM `transactions`;
--> statement-breakpoint
DROP TABLE `transactions`;
--> statement-breakpoint
ALTER TABLE `__new_transactions` RENAME TO `transactions`;
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_transactions_owner_id` ON `transactions` (`owner_id`,`id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_transactions_owner_sequence` ON `transactions` (`owner_id`,`sequence`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_transactions_active_opening_balance` ON `transactions` (`account_id`) WHERE "transactions"."type" = 'opening_balance' AND "transactions"."deleted_at" IS NULL;
--> statement-breakpoint
CREATE INDEX `ix_transactions_account_date` ON `transactions` (`owner_id`,`account_id`,`occurred_on`);
--> statement-breakpoint
CREATE INDEX `ix_transactions_counter_account_date` ON `transactions` (`owner_id`,`counter_account_id`,`occurred_on`) WHERE "transactions"."counter_account_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX `ix_transactions_owner_order` ON `transactions` (`owner_id`,`occurred_on`,`sequence`);
--> statement-breakpoint
CREATE INDEX `ix_transactions_category_date` ON `transactions` (`owner_id`,`category_id`,`occurred_on`);
--> statement-breakpoint
CREATE INDEX `ix_transactions_group` ON `transactions` (`group_id`) WHERE "transactions"."group_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX `ix_transactions_refund_of` ON `transactions` (`owner_id`,`refund_of_id`) WHERE "transactions"."refund_of_id" IS NOT NULL;
--> statement-breakpoint

-- views (identical to 0001_ledger_views.sql) ------------------------------------
CREATE VIEW `active_transactions` AS
SELECT * FROM `transactions` WHERE `deleted_at` IS NULL;
--> statement-breakpoint
CREATE VIEW `account_entries` AS
SELECT
  `owner_id`,
  `id` AS `transaction_id`,
  `account_id`,
  `amount_minor` AS `delta_minor`,
  `occurred_on`,
  `sequence`,
  `type`
FROM `active_transactions`
UNION ALL
SELECT
  `owner_id`,
  `id` AS `transaction_id`,
  `counter_account_id` AS `account_id`,
  -`amount_minor` AS `delta_minor`,
  `occurred_on`,
  `sequence`,
  `type`
FROM `active_transactions`
WHERE `type` = 'transfer';
--> statement-breakpoint

-- Referential-integrity guard: abort (and roll back this migration) if any
-- foreign key is violated after the rebuild.
CREATE TEMP TABLE `__fk_guard` (`violations` integer NOT NULL CHECK (`violations` = 0));
--> statement-breakpoint
INSERT INTO `__fk_guard` SELECT count(*) FROM pragma_foreign_key_check;
--> statement-breakpoint
DROP TABLE `__fk_guard`;
