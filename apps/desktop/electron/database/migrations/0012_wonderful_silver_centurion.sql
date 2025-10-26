CREATE TABLE `prop_pages` (
	`id` integer PRIMARY KEY NOT NULL,
	`prop_id` integer NOT NULL,
	`page_id` integer NOT NULL,
	`x` real NOT NULL,
	`y` real NOT NULL,
	`relative_points` text NOT NULL,
	`properties` text DEFAULT '{}' NOT NULL,
	`origin_x` text DEFAULT 'left' NOT NULL,
	`origin_y` text DEFAULT 'bottom' NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`prop_id`) REFERENCES `props`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prop_pages_prop_id_page_id_unique` ON `prop_pages` (`prop_id`,`page_id`);--> statement-breakpoint
CREATE TABLE `props` (
	`id` integer PRIMARY KEY NOT NULL,
	`type` text DEFAULT 'polygon' NOT NULL,
	`field_label` text,
	`notes` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
