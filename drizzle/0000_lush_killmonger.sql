CREATE TABLE `job_files` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`owner_email` text NOT NULL,
	`category` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`storage_key` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`student_name` text,
	`current_course` text,
	`target_course` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`result` text,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
