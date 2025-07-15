PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_shape_page_marchers` (
	`id` integer PRIMARY KEY NOT NULL,
	`shape_page_id` integer NOT NULL,
	`marcher_id` integer NOT NULL,
	`position_order` integer,
	`created_at` text DEFAULT 'sql`(CURRENT_TIMESTAMP)`' NOT NULL,
	`updated_at` text DEFAULT 'sql`(CURRENT_TIMESTAMP)`' NOT NULL,
	`notes` text,
	FOREIGN KEY (`shape_page_id`) REFERENCES `shape_pages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`marcher_id`) REFERENCES `marchers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_shape_page_marchers`("id", "shape_page_id", "marcher_id", "position_order", "created_at", "updated_at", "notes") SELECT "id", "shape_page_id", "marcher_id", "position_order", "created_at", "updated_at", "notes" FROM `shape_page_marchers`;--> statement-breakpoint
DROP TABLE `shape_page_marchers`;--> statement-breakpoint
ALTER TABLE `__new_shape_page_marchers` RENAME TO `shape_page_marchers`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx-spm-marcher_id` ON `shape_page_marchers` (`marcher_id`);--> statement-breakpoint
CREATE INDEX `idx-spm-shape_page_id` ON `shape_page_marchers` (`shape_page_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `shape_page_marchers_shape_page_id_marcher_id_unique` ON `shape_page_marchers` (`shape_page_id`,`marcher_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `shape_page_marchers_shape_page_id_position_order_unique` ON `shape_page_marchers` (`shape_page_id`,`position_order`);