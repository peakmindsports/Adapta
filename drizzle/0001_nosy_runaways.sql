CREATE TABLE `user_settings` (
	`owner_email` text PRIMARY KEY NOT NULL,
	`model` text DEFAULT 'gpt-5-mini' NOT NULL,
	`updated_at` integer NOT NULL
);
