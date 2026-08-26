CREATE TABLE `shared_resource_recipients` (
	`job_id` text NOT NULL,
	`owner_email` text NOT NULL,
	`recipient_email` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`job_id`, `recipient_email`),
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
