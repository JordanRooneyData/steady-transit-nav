CREATE TABLE `notification_deliveries` (
	`event_key` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_notification_deliveries_user_id` ON `notification_deliveries` (`user_id`);