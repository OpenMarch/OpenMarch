PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_audio_files` (
	`id` integer PRIMARY KEY NOT NULL,
	`path` text NOT NULL,
	`nickname` text,
	`data` blob,
	`selected` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_audio_files`("id", "path", "nickname", "data", "selected", "created_at", "updated_at") SELECT "id", "path", "nickname", "data", "selected", "created_at", "updated_at" FROM `audio_files`;--> statement-breakpoint
DROP TABLE `audio_files`;--> statement-breakpoint
ALTER TABLE `__new_audio_files` RENAME TO `audio_files`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_beats` (
	`id` integer PRIMARY KEY NOT NULL,
	`duration` real NOT NULL,
	`position` integer NOT NULL,
	`include_in_measure` integer DEFAULT 1 NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	CONSTRAINT "beats_duration_check" CHECK(duration >= 0),
	CONSTRAINT "beats_position_check" CHECK(position >= 0),
	CONSTRAINT "beats_include_in_measure" CHECK(include_in_measure IN (0, 1))
);
--> statement-breakpoint
INSERT INTO `__new_beats`("id", "duration", "position", "include_in_measure", "notes", "created_at", "updated_at") SELECT "id", "duration", "position", "include_in_measure", "notes", "created_at", "updated_at" FROM `beats`;--> statement-breakpoint
DROP TABLE `beats`;--> statement-breakpoint
ALTER TABLE `__new_beats` RENAME TO `beats`;--> statement-breakpoint
CREATE TABLE `__new_marcher_pages` (
	`id` integer PRIMARY KEY NOT NULL,
	`marcher_id` integer NOT NULL,
	`page_id` integer NOT NULL,
	`x` real NOT NULL,
	`y` real NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`path_data_id` integer,
	`path_start_position` real,
	`path_end_position` real,
	`notes` text,
	FOREIGN KEY (`marcher_id`) REFERENCES `marchers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`path_data_id`) REFERENCES `pathways`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "marcher_pages_path_data_position_check" CHECK(path_start_position >= 0 AND path_start_position <= 1 AND path_end_position >= 0 AND path_end_position <= 1)
);
--> statement-breakpoint
INSERT INTO `__new_marcher_pages`("id", "marcher_id", "page_id", "x", "y", "created_at", "updated_at", "path_data_id", "path_start_position", "path_end_position", "notes") SELECT "id", "marcher_id", "page_id", "x", "y", "created_at", "updated_at", "path_data_id", "path_start_position", "path_end_position", "notes" FROM `marcher_pages`;--> statement-breakpoint
DROP TABLE `marcher_pages`;--> statement-breakpoint
ALTER TABLE `__new_marcher_pages` RENAME TO `marcher_pages`;--> statement-breakpoint
CREATE INDEX `index_marcher_pages_on_page_id` ON `marcher_pages` (`page_id`);--> statement-breakpoint
CREATE INDEX `index_marcher_pages_on_marcher_id` ON `marcher_pages` (`marcher_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `marcher_pages_marcher_id_page_id_unique` ON `marcher_pages` (`marcher_id`,`page_id`);--> statement-breakpoint
CREATE TABLE `__new_marchers` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text,
	`section` text NOT NULL,
	`year` text,
	`notes` text,
	`drill_prefix` text NOT NULL,
	`drill_order` integer NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_marchers`("id", "name", "section", "year", "notes", "drill_prefix", "drill_order", "created_at", "updated_at") SELECT "id", "name", "section", "year", "notes", "drill_prefix", "drill_order", "created_at", "updated_at" FROM `marchers`;--> statement-breakpoint
DROP TABLE `marchers`;--> statement-breakpoint
ALTER TABLE `__new_marchers` RENAME TO `marchers`;--> statement-breakpoint
CREATE UNIQUE INDEX `marchers_drill_prefix_drill_order_unique` ON `marchers` (`drill_prefix`,`drill_order`);--> statement-breakpoint
CREATE TABLE `__new_measures` (
	`id` integer PRIMARY KEY NOT NULL,
	`start_beat` integer NOT NULL,
	`rehearsal_mark` text,
	`notes` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`start_beat`) REFERENCES `beats`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_measures`("id", "start_beat", "rehearsal_mark", "notes", "created_at", "updated_at") SELECT "id", "start_beat", "rehearsal_mark", "notes", "created_at", "updated_at" FROM `measures`;--> statement-breakpoint
DROP TABLE `measures`;--> statement-breakpoint
ALTER TABLE `__new_measures` RENAME TO `measures`;--> statement-breakpoint
CREATE TABLE `__new_midsets` (
	`id` integer PRIMARY KEY NOT NULL,
	`mp_id` integer NOT NULL,
	`x` real NOT NULL,
	`y` real NOT NULL,
	`progress_placement` real NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`path_data_id` integer,
	`path_start_position` real,
	`path_end_position` real,
	`notes` text,
	FOREIGN KEY (`mp_id`) REFERENCES `marcher_pages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`path_data_id`) REFERENCES `pathways`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "midsets_path_data_position_check" CHECK(path_start_position >= 0 AND path_start_position <= 1 AND path_end_position >= 0 AND path_end_position <= 1),
	CONSTRAINT "placement_check" CHECK(progress_placement > 0 AND progress_placement < 1)
);
--> statement-breakpoint
INSERT INTO `__new_midsets`("id", "mp_id", "x", "y", "progress_placement", "created_at", "updated_at", "path_data_id", "path_start_position", "path_end_position", "notes") SELECT "id", "mp_id", "x", "y", "progress_placement", "created_at", "updated_at", "path_data_id", "path_start_position", "path_end_position", "notes" FROM `midsets`;--> statement-breakpoint
DROP TABLE `midsets`;--> statement-breakpoint
ALTER TABLE `__new_midsets` RENAME TO `midsets`;--> statement-breakpoint
CREATE UNIQUE INDEX `midsets_mp_id_progress_placement_unique` ON `midsets` (`mp_id`,`progress_placement`);--> statement-breakpoint
CREATE TABLE `__new_pages` (
	`id` integer PRIMARY KEY NOT NULL,
	`is_subset` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`start_beat` integer NOT NULL,
	FOREIGN KEY (`start_beat`) REFERENCES `beats`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "pages_is_subset_check" CHECK(is_subset IN (0, 1))
);
--> statement-breakpoint
INSERT INTO `__new_pages`("id", "is_subset", "notes", "created_at", "updated_at", "start_beat") SELECT "id", "is_subset", "notes", "created_at", "updated_at", "start_beat" FROM `pages`;--> statement-breakpoint
DROP TABLE `pages`;--> statement-breakpoint
ALTER TABLE `__new_pages` RENAME TO `pages`;--> statement-breakpoint
CREATE UNIQUE INDEX `pages_start_beat_unique` ON `pages` (`start_beat`);--> statement-breakpoint
CREATE TABLE `__new_section_appearances` (
	`id` integer PRIMARY KEY NOT NULL,
	`section` text NOT NULL,
	`fill_color` text DEFAULT 'rgba(0, 0, 0, 1)' NOT NULL,
	`outline_color` text DEFAULT 'rgba(0, 0, 0, 1)' NOT NULL,
	`shape_type` text DEFAULT 'circle' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_section_appearances`("id", "section", "fill_color", "outline_color", "shape_type", "created_at", "updated_at") SELECT "id", "section", "fill_color", "outline_color", "shape_type", "created_at", "updated_at" FROM `section_appearances`;--> statement-breakpoint
DROP TABLE `section_appearances`;--> statement-breakpoint
ALTER TABLE `__new_section_appearances` RENAME TO `section_appearances`;--> statement-breakpoint
CREATE TABLE `__new_shape_page_marchers` (
	`id` integer PRIMARY KEY NOT NULL,
	`shape_page_id` integer NOT NULL,
	`marcher_id` integer NOT NULL,
	`position_order` integer,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`notes` text,
	FOREIGN KEY (`shape_page_id`) REFERENCES `shape_pages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`marcher_id`) REFERENCES `marchers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_shape_page_marchers`("id", "shape_page_id", "marcher_id", "position_order", "created_at", "updated_at", "notes") SELECT "id", "shape_page_id", "marcher_id", "position_order", "created_at", "updated_at", "notes" FROM `shape_page_marchers`;--> statement-breakpoint
DROP TABLE `shape_page_marchers`;--> statement-breakpoint
ALTER TABLE `__new_shape_page_marchers` RENAME TO `shape_page_marchers`;--> statement-breakpoint
CREATE INDEX `idx-spm-marcher_id` ON `shape_page_marchers` (`marcher_id`);--> statement-breakpoint
CREATE INDEX `idx-spm-shape_page_id` ON `shape_page_marchers` (`shape_page_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `shape_page_marchers_shape_page_id_marcher_id_unique` ON `shape_page_marchers` (`shape_page_id`,`marcher_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `shape_page_marchers_shape_page_id_position_order_unique` ON `shape_page_marchers` (`shape_page_id`,`position_order`);--> statement-breakpoint
CREATE TABLE `__new_shape_pages` (
	`id` integer PRIMARY KEY NOT NULL,
	`shape_id` integer NOT NULL,
	`page_id` integer NOT NULL,
	`svg_path` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`notes` text,
	FOREIGN KEY (`shape_id`) REFERENCES `shapes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_shape_pages`("id", "shape_id", "page_id", "svg_path", "created_at", "updated_at", "notes") SELECT "id", "shape_id", "page_id", "svg_path", "created_at", "updated_at", "notes" FROM `shape_pages`;--> statement-breakpoint
DROP TABLE `shape_pages`;--> statement-breakpoint
ALTER TABLE `__new_shape_pages` RENAME TO `shape_pages`;--> statement-breakpoint
CREATE UNIQUE INDEX `shape_pages_page_id_shape_id_unique` ON `shape_pages` (`page_id`,`shape_id`);--> statement-breakpoint
CREATE TABLE `__new_shapes` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`notes` text
);
--> statement-breakpoint
INSERT INTO `__new_shapes`("id", "name", "created_at", "updated_at", "notes") SELECT "id", "name", "created_at", "updated_at", "notes" FROM `shapes`;--> statement-breakpoint
DROP TABLE `shapes`;--> statement-breakpoint
ALTER TABLE `__new_shapes` RENAME TO `shapes`;--> statement-breakpoint
CREATE TABLE `__new_utility` (
	`id` integer PRIMARY KEY NOT NULL,
	`last_page_counts` integer DEFAULT 8 NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	CONSTRAINT "utility_last_page_counts_check" CHECK(last_page_counts > 0),
	CONSTRAINT "utility_id_check" CHECK(id = 0)
);
--> statement-breakpoint
INSERT INTO `__new_utility`("id", "last_page_counts") SELECT "id", "last_page_counts" FROM `utility`;--> statement-breakpoint
DROP TABLE `utility`;--> statement-breakpoint
ALTER TABLE `__new_utility` RENAME TO `utility`;--> statement-breakpoint
ALTER TABLE `pathways` ADD `created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL;--> statement-breakpoint
ALTER TABLE `pathways` ADD `updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL;
