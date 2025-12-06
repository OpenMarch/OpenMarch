CREATE TABLE `marcher_tags` (
	`id` integer PRIMARY KEY NOT NULL,
	`marcher_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`marcher_id`) REFERENCES `marchers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `marcher_tags_marcher_id_tag_id_unique` ON `marcher_tags` (`marcher_id`,`tag_id`);--> statement-breakpoint
CREATE TABLE `tag_appearances` (
	`id` integer PRIMARY KEY NOT NULL,
	`tag_id` integer NOT NULL,
	`start_page_id` integer NOT NULL,
	`fill_color` text,
	`outline_color` text,
	`shape_type` text,
	`visible` integer DEFAULT 1 NOT NULL,
	`label_visible` integer DEFAULT 1 NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`start_page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tag_appearances_tag_id_start_page_id_unique` ON `tag_appearances` (`tag_id`,`start_page_id`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text,
	`description` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
