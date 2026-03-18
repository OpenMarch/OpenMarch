DROP TABLE `midsets`;--> statement-breakpoint
DROP TABLE `pathways`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_marcher_pages` (
	`id` integer PRIMARY KEY NOT NULL,
	`marcher_id` integer NOT NULL,
	`page_id` integer NOT NULL,
	`x` real NOT NULL,
	`y` real NOT NULL,
	`incoming_path_json` text,
	`notes` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`fill_color` text,
	`outline_color` text,
	`shape_type` text,
	`visible` integer DEFAULT 1 NOT NULL,
	`label_visible` integer DEFAULT 1 NOT NULL,
	`equipment_name` text,
	`equipment_state` text,
	FOREIGN KEY (`marcher_id`) REFERENCES `marchers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_marcher_pages`("id", "marcher_id", "page_id", "x", "y", "notes", "created_at", "updated_at", "fill_color", "outline_color", "shape_type", "visible", "label_visible", "equipment_name", "equipment_state") SELECT "id", "marcher_id", "page_id", "x", "y", "notes", "created_at", "updated_at", "fill_color", "outline_color", "shape_type", "visible", "label_visible", "equipment_name", "equipment_state" FROM `marcher_pages`;--> statement-breakpoint
DROP TABLE `marcher_pages`;--> statement-breakpoint
ALTER TABLE `__new_marcher_pages` RENAME TO `marcher_pages`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `index_marcher_pages_on_page_id` ON `marcher_pages` (`page_id`);--> statement-breakpoint
CREATE INDEX `index_marcher_pages_on_marcher_id` ON `marcher_pages` (`marcher_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `marcher_pages_marcher_id_page_id_unique` ON `marcher_pages` (`marcher_id`,`page_id`);
