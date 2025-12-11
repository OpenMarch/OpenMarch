PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_marcher_pages` (
	`id` integer PRIMARY KEY NOT NULL,
	`marcher_id` integer NOT NULL,
	`page_id` integer NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`notes` text,
	`x` real NOT NULL,
	`y` real NOT NULL,
	`path_data_id` integer,
	`path_start_position` real,
	`path_arrival_position` real,
	`rotation_degrees` real DEFAULT 0 NOT NULL,
	`fill_color` text,
	`outline_color` text,
	`shape_type` text,
	`visible` integer DEFAULT 1 NOT NULL,
	`label_visible` integer DEFAULT 1 NOT NULL,
	`equipment_name` text,
	`equipment_state` text,
	FOREIGN KEY (`marcher_id`) REFERENCES `marchers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`path_data_id`) REFERENCES `pathways`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "marcher_pages_path_start_position_check" CHECK(path_start_position >= 0 AND path_start_position <= 1),
	CONSTRAINT "marcher_pages_path_arrival_position_check" CHECK(path_arrival_position >= 0 AND path_arrival_position <= 1)
);
--> statement-breakpoint
INSERT INTO `__new_marcher_pages`("id", "marcher_id", "page_id", "created_at", "updated_at", "notes", "x", "y", "path_data_id", "path_start_position", "path_arrival_position", "rotation_degrees", "fill_color", "outline_color", "shape_type", "visible", "label_visible", "equipment_name", "equipment_state") SELECT "id", "marcher_id", "page_id", "created_at", "updated_at", "notes", "x", "y", "path_data_id", "path_start_position", "path_end_position", "rotation_degrees", "fill_color", "outline_color", "shape_type", "visible", "label_visible", "equipment_name", "equipment_state" FROM `marcher_pages`;--> statement-breakpoint
DROP TABLE `marcher_pages`;--> statement-breakpoint
ALTER TABLE `__new_marcher_pages` RENAME TO `marcher_pages`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `index_marcher_pages_on_page_id` ON `marcher_pages` (`page_id`);--> statement-breakpoint
CREATE INDEX `index_marcher_pages_on_marcher_id` ON `marcher_pages` (`marcher_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `marcher_pages_marcher_id_page_id_unique` ON `marcher_pages` (`marcher_id`,`page_id`);--> statement-breakpoint
CREATE TABLE `__new_midsets` (
	`id` integer PRIMARY KEY NOT NULL,
	`mp_id` integer NOT NULL,
	`progress_placement` real NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`x` real NOT NULL,
	`y` real NOT NULL,
	`path_data_id` integer,
	`path_start_position` real,
	`path_arrival_position` real,
	`rotation_degrees` real DEFAULT 0 NOT NULL,
	`notes` text,
	FOREIGN KEY (`mp_id`) REFERENCES `marcher_pages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`path_data_id`) REFERENCES `pathways`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "midsets_path_start_position_check" CHECK(path_start_position >= 0 AND path_start_position <= 1),
	CONSTRAINT "midsets_path_arrival_position_check" CHECK(path_arrival_position >= 0 AND path_arrival_position <= 1),
	CONSTRAINT "placement_check" CHECK(progress_placement > 0 AND progress_placement < 1)
);
--> statement-breakpoint
INSERT INTO `__new_midsets`("id", "mp_id", "progress_placement", "created_at", "updated_at", "x", "y", "path_data_id", "path_start_position", "path_arrival_position", "notes") SELECT "id", "mp_id", "progress_placement", "created_at", "updated_at", "x", "y", "path_data_id", "path_start_position", "path_end_position", "notes" FROM `midsets`;--> statement-breakpoint
DROP TABLE `midsets`;--> statement-breakpoint
ALTER TABLE `__new_midsets` RENAME TO `midsets`;--> statement-breakpoint
CREATE UNIQUE INDEX `midsets_mp_id_progress_placement_unique` ON `midsets` (`mp_id`,`progress_placement`);--> statement-breakpoint
CREATE TABLE `__new_prop_pages` (
	`id` integer PRIMARY KEY NOT NULL,
	`prop_id` integer NOT NULL,
	`page_id` integer NOT NULL,
	`relative_points` text NOT NULL,
	`properties` text DEFAULT '{}' NOT NULL,
	`notes` text,
	`x` real NOT NULL,
	`y` real NOT NULL,
	`path_data_id` integer,
	`path_start_position` real,
	`path_arrival_position` real,
	`rotation_degrees` real DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`prop_id`) REFERENCES `props`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`path_data_id`) REFERENCES `pathways`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "prop_pages_path_start_position_check" CHECK(path_start_position >= 0 AND path_start_position <= 1),
	CONSTRAINT "prop_pages_path_arrival_position_check" CHECK(path_arrival_position >= 0 AND path_arrival_position <= 1)
);
--> statement-breakpoint
INSERT INTO `__new_prop_pages`("id", "prop_id", "page_id", "relative_points", "properties", "notes", "x", "y", "created_at", "updated_at") SELECT "id", "prop_id", "page_id", "relative_points", "properties", "notes", "x", "y", "created_at", "updated_at" FROM `prop_pages`;--> statement-breakpoint
DROP TABLE `prop_pages`;--> statement-breakpoint
ALTER TABLE `__new_prop_pages` RENAME TO `prop_pages`;--> statement-breakpoint
CREATE UNIQUE INDEX `prop_pages_prop_id_page_id_unique` ON `prop_pages` (`prop_id`,`page_id`);--> statement-breakpoint
ALTER TABLE `props` ADD `origin_x` text DEFAULT 'left' NOT NULL;--> statement-breakpoint
ALTER TABLE `props` ADD `origin_y` text DEFAULT 'bottom' NOT NULL;
