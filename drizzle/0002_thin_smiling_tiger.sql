CREATE TABLE `context_phrases` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`category` text NOT NULL,
	`phrase` text NOT NULL,
	`created_at` integer NOT NULL
);
