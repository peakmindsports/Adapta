CREATE TABLE `shared_project_reads` (
	`owner_email` text NOT NULL,
	`project_id` text NOT NULL,
	`read_at` integer NOT NULL,
	PRIMARY KEY(`owner_email`, `project_id`)
);
