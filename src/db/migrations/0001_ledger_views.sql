-- Ledger read views (docs/domain-model.md §1.4, §12).
-- Every read of the ledger goes through these views: the soft-delete filter and
-- the sign/mirror rules for transfers live here and nowhere else.
-- Standard SQL; ports to PostgreSQL unchanged.

CREATE VIEW `active_transactions` AS
SELECT * FROM `transactions` WHERE `deleted_at` IS NULL;
--> statement-breakpoint

-- One entry per active transaction on its account, plus the mirrored entry on the
-- counter account for transfers. Transfers therefore net to zero by construction.
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
