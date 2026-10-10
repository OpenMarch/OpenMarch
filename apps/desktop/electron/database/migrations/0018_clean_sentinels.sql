CREATE TABLE `timeline_kept_assignments` (
	`assignment_id` integer PRIMARY KEY NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`assignment_id`) REFERENCES `timeline_assignments`(`id`) ON UPDATE no action ON DELETE cascade
);
