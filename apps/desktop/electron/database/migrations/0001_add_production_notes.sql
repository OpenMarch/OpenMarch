CREATE TABLE `production_notes` (
	`id` integer PRIMARY KEY NOT NULL,
	`page_id` integer NOT NULL,
	`content` text NOT NULL,
	`is_published` integer DEFAULT 1 NOT NULL,
	`order_index` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE cascade
);
