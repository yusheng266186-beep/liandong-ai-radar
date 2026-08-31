CREATE TABLE `price_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_id` text NOT NULL,
	`price` real,
	`currency` text NOT NULL,
	`price_cny` real,
	`stock_status` text NOT NULL,
	`stock_count` integer,
	`verification` text NOT NULL,
	`evidence_json` text DEFAULT '[]' NOT NULL,
	`checked_at` text NOT NULL,
	`latency_ms` integer
);
--> statement-breakpoint
CREATE INDEX `price_snapshots_source_id_idx` ON `price_snapshots` (`source_id`,`id`);--> statement-breakpoint
CREATE INDEX `price_snapshots_checked_at_idx` ON `price_snapshots` (`checked_at`);