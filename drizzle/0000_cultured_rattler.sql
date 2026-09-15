CREATE TABLE `journey_sessions` (
	`user_id` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`snapshot` text NOT NULL,
	`updated_at` integer NOT NULL
);
