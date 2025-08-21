PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_marcher_pages` (
	`id` integer PRIMARY KEY NOT NULL,
	`id_for_html` text,
	`marcher_id` integer NOT NULL,
	`page_id` integer NOT NULL,
	`x` real NOT NULL,
	`y` real NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`path_data_id` integer,
	`start_path_position` real,
	`end_path_position` real,
	`notes` text,
	FOREIGN KEY (`marcher_id`) REFERENCES `marchers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`path_data_id`) REFERENCES `pathways`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "marcher_pages_path_data_position_check" CHECK(start_path_position >= 0 AND start_path_position <= 1 AND end_path_position >= 0 AND end_path_position <= 1)
);
--> statement-breakpoint
INSERT INTO `__new_marcher_pages`("id", "id_for_html", "marcher_id", "page_id", "x", "y", "created_at", "updated_at", "path_data_id", "notes") SELECT "id", "id_for_html", "marcher_id", "page_id", "x", "y", "created_at", "updated_at", "path_data_id", "notes" FROM `marcher_pages`;--> statement-breakpoint
DROP TABLE `marcher_pages`;--> statement-breakpoint
ALTER TABLE `__new_marcher_pages` RENAME TO `marcher_pages`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `index_marcher_pages_on_page_id` ON `marcher_pages` (`page_id`);--> statement-breakpoint
CREATE INDEX `index_marcher_pages_on_marcher_id` ON `marcher_pages` (`marcher_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `marcher_pages_marcher_id_page_id_unique` ON `marcher_pages` (`marcher_id`,`page_id`);--> statement-breakpoint
CREATE TABLE `__new_midsets` (
	`id` integer PRIMARY KEY NOT NULL,
	`mp_id` integer NOT NULL,
	`x` real NOT NULL,
	`y` real NOT NULL,
	`progress_placement` real NOT NULL,
	`created_at` text DEFAULT 'sql`(CURRENT_TIMESTAMP)`' NOT NULL,
	`updated_at` text DEFAULT 'sql`(CURRENT_TIMESTAMP)`' NOT NULL,
	`path_data_id` integer,
	`start_path_position` real,
	`end_path_position` real,
	`notes` text,
	FOREIGN KEY (`mp_id`) REFERENCES `marcher_pages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`path_data_id`) REFERENCES `pathways`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "midsets_path_data_position_check" CHECK(start_path_position >= 0 AND start_path_position <= 1 AND end_path_position >= 0 AND end_path_position <= 1),
	CONSTRAINT "placement_check" CHECK(progress_placement > 0 AND progress_placement < 1)
);
--> statement-breakpoint
INSERT INTO `__new_midsets`("id", "mp_id", "x", "y", "progress_placement", "created_at", "updated_at", "path_data_id", "notes") SELECT "id", "mp_id", "x", "y", "progress_placement", "created_at", "updated_at", "path_data_id", "notes" FROM `midsets`;--> statement-breakpoint
DROP TABLE `midsets`;--> statement-breakpoint
ALTER TABLE `__new_midsets` RENAME TO `midsets`;--> statement-breakpoint
CREATE UNIQUE INDEX `midsets_mp_id_progress_placement_unique` ON `midsets` (`mp_id`,`progress_placement`);
