-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TABLE `history_undo` (
	`sequence` integer PRIMARY KEY,
	`history_group` integer NOT NULL,
	`sql` text NOT NULL,
	CONSTRAINT "history_stats_check_1" CHECK(id = 1),
	CONSTRAINT "beats_check_2" CHECK(duration >= 0),
	CONSTRAINT "beats_check_3" CHECK(position >= 0),
	CONSTRAINT "beats_check_4" CHECK(include_in_measure IN (0, 1),
	CONSTRAINT "pages_check_5" CHECK(is_subset IN (0, 1),
	CONSTRAINT "field_properties_check_6" CHECK(id = 1),
	CONSTRAINT "utility_check_7" CHECK(id = 0),
	CONSTRAINT "utility_check_8" CHECK(last_page_counts >= 1)
);
--> statement-breakpoint
CREATE TABLE `history_redo` (
	`sequence` integer PRIMARY KEY,
	`history_group` integer NOT NULL,
	`sql` text NOT NULL,
	CONSTRAINT "history_stats_check_1" CHECK(id = 1),
	CONSTRAINT "beats_check_2" CHECK(duration >= 0),
	CONSTRAINT "beats_check_3" CHECK(position >= 0),
	CONSTRAINT "beats_check_4" CHECK(include_in_measure IN (0, 1),
	CONSTRAINT "pages_check_5" CHECK(is_subset IN (0, 1),
	CONSTRAINT "field_properties_check_6" CHECK(id = 1),
	CONSTRAINT "utility_check_7" CHECK(id = 0),
	CONSTRAINT "utility_check_8" CHECK(last_page_counts >= 1)
);
--> statement-breakpoint
CREATE TABLE `history_stats` (
	`id` integer PRIMARY KEY,
	`cur_undo_group` integer NOT NULL,
	`cur_redo_group` integer NOT NULL,
	`group_limit` integer NOT NULL,
	CONSTRAINT "history_stats_check_1" CHECK(id = 1),
	CONSTRAINT "beats_check_2" CHECK(duration >= 0),
	CONSTRAINT "beats_check_3" CHECK(position >= 0),
	CONSTRAINT "beats_check_4" CHECK(include_in_measure IN (0, 1),
	CONSTRAINT "pages_check_5" CHECK(is_subset IN (0, 1),
	CONSTRAINT "field_properties_check_6" CHECK(id = 1),
	CONSTRAINT "utility_check_7" CHECK(id = 0),
	CONSTRAINT "utility_check_8" CHECK(last_page_counts >= 1)
);
--> statement-breakpoint
CREATE TABLE `beats` (
	`id` integer PRIMARY KEY,
	`duration` real NOT NULL,
	`position` integer NOT NULL,
	`include_in_measure` integer DEFAULT 1 NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	CONSTRAINT "history_stats_check_1" CHECK(id = 1),
	CONSTRAINT "beats_check_2" CHECK(duration >= 0),
	CONSTRAINT "beats_check_3" CHECK(position >= 0),
	CONSTRAINT "beats_check_4" CHECK(include_in_measure IN (0, 1),
	CONSTRAINT "pages_check_5" CHECK(is_subset IN (0, 1),
	CONSTRAINT "field_properties_check_6" CHECK(id = 1),
	CONSTRAINT "utility_check_7" CHECK(id = 0),
	CONSTRAINT "utility_check_8" CHECK(last_page_counts >= 1)
);
--> statement-breakpoint
CREATE TABLE `measures` (
	`id` integer PRIMARY KEY,
	`start_beat` integer NOT NULL,
	`rehearsal_mark` text,
	`notes` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`start_beat`) REFERENCES `beats`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "history_stats_check_1" CHECK(id = 1),
	CONSTRAINT "beats_check_2" CHECK(duration >= 0),
	CONSTRAINT "beats_check_3" CHECK(position >= 0),
	CONSTRAINT "beats_check_4" CHECK(include_in_measure IN (0, 1),
	CONSTRAINT "pages_check_5" CHECK(is_subset IN (0, 1),
	CONSTRAINT "field_properties_check_6" CHECK(id = 1),
	CONSTRAINT "utility_check_7" CHECK(id = 0),
	CONSTRAINT "utility_check_8" CHECK(last_page_counts >= 1)
);
--> statement-breakpoint
CREATE TABLE `pages` (
	`id` integer PRIMARY KEY,
	`is_subset` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`start_beat` integer NOT NULL,
	FOREIGN KEY (`start_beat`) REFERENCES `beats`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "history_stats_check_1" CHECK(id = 1),
	CONSTRAINT "beats_check_2" CHECK(duration >= 0),
	CONSTRAINT "beats_check_3" CHECK(position >= 0),
	CONSTRAINT "beats_check_4" CHECK(include_in_measure IN (0, 1),
	CONSTRAINT "pages_check_5" CHECK(is_subset IN (0, 1),
	CONSTRAINT "field_properties_check_6" CHECK(id = 1),
	CONSTRAINT "utility_check_7" CHECK(id = 0),
	CONSTRAINT "utility_check_8" CHECK(last_page_counts >= 1)
);
--> statement-breakpoint
CREATE TABLE `marchers` (
	`id` integer PRIMARY KEY,
	`name` text,
	`section` text NOT NULL,
	`year` text,
	`notes` text,
	`drill_prefix` text NOT NULL,
	`drill_order` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "history_stats_check_1" CHECK(id = 1),
	CONSTRAINT "beats_check_2" CHECK(duration >= 0),
	CONSTRAINT "beats_check_3" CHECK(position >= 0),
	CONSTRAINT "beats_check_4" CHECK(include_in_measure IN (0, 1),
	CONSTRAINT "pages_check_5" CHECK(is_subset IN (0, 1),
	CONSTRAINT "field_properties_check_6" CHECK(id = 1),
	CONSTRAINT "utility_check_7" CHECK(id = 0),
	CONSTRAINT "utility_check_8" CHECK(last_page_counts >= 1)
);
--> statement-breakpoint
CREATE TABLE `marcher_pages` (
	`id` integer PRIMARY KEY,
	`id_for_html` text,
	`marcher_id` integer NOT NULL,
	`page_id` integer NOT NULL,
	`x` real,
	`y` real,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`notes` text,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`marcher_id`) REFERENCES `marchers`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "history_stats_check_1" CHECK(id = 1),
	CONSTRAINT "beats_check_2" CHECK(duration >= 0),
	CONSTRAINT "beats_check_3" CHECK(position >= 0),
	CONSTRAINT "beats_check_4" CHECK(include_in_measure IN (0, 1),
	CONSTRAINT "pages_check_5" CHECK(is_subset IN (0, 1),
	CONSTRAINT "field_properties_check_6" CHECK(id = 1),
	CONSTRAINT "utility_check_7" CHECK(id = 0),
	CONSTRAINT "utility_check_8" CHECK(last_page_counts >= 1)
);
--> statement-breakpoint
CREATE INDEX `index_marcher_pages_on_page_id` ON `marcher_pages` (`page_id`);--> statement-breakpoint
CREATE INDEX `index_marcher_pages_on_marcher_id` ON `marcher_pages` (`marcher_id`);--> statement-breakpoint
CREATE TABLE `field_properties` (
	`id` integer PRIMARY KEY,
	`json_data` text NOT NULL,
	`image` blob,
	CONSTRAINT "history_stats_check_1" CHECK(id = 1),
	CONSTRAINT "beats_check_2" CHECK(duration >= 0),
	CONSTRAINT "beats_check_3" CHECK(position >= 0),
	CONSTRAINT "beats_check_4" CHECK(include_in_measure IN (0, 1),
	CONSTRAINT "pages_check_5" CHECK(is_subset IN (0, 1),
	CONSTRAINT "field_properties_check_6" CHECK(id = 1),
	CONSTRAINT "utility_check_7" CHECK(id = 0),
	CONSTRAINT "utility_check_8" CHECK(last_page_counts >= 1)
);
--> statement-breakpoint
CREATE TABLE `audio_files` (
	`id` integer PRIMARY KEY,
	`path` text NOT NULL,
	`nickname` text,
	`data` blob,
	`selected` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "history_stats_check_1" CHECK(id = 1),
	CONSTRAINT "beats_check_2" CHECK(duration >= 0),
	CONSTRAINT "beats_check_3" CHECK(position >= 0),
	CONSTRAINT "beats_check_4" CHECK(include_in_measure IN (0, 1),
	CONSTRAINT "pages_check_5" CHECK(is_subset IN (0, 1),
	CONSTRAINT "field_properties_check_6" CHECK(id = 1),
	CONSTRAINT "utility_check_7" CHECK(id = 0),
	CONSTRAINT "utility_check_8" CHECK(last_page_counts >= 1)
);
--> statement-breakpoint
CREATE TABLE `shapes` (
	`id` integer PRIMARY KEY,
	`name` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`notes` text,
	CONSTRAINT "history_stats_check_1" CHECK(id = 1),
	CONSTRAINT "beats_check_2" CHECK(duration >= 0),
	CONSTRAINT "beats_check_3" CHECK(position >= 0),
	CONSTRAINT "beats_check_4" CHECK(include_in_measure IN (0, 1),
	CONSTRAINT "pages_check_5" CHECK(is_subset IN (0, 1),
	CONSTRAINT "field_properties_check_6" CHECK(id = 1),
	CONSTRAINT "utility_check_7" CHECK(id = 0),
	CONSTRAINT "utility_check_8" CHECK(last_page_counts >= 1)
);
--> statement-breakpoint
CREATE TABLE `shape_pages` (
	`id` integer PRIMARY KEY,
	`shape_id` integer NOT NULL,
	`page_id` integer NOT NULL,
	`svg_path` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`notes` text,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`shape_id`) REFERENCES `shapes`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "history_stats_check_1" CHECK(id = 1),
	CONSTRAINT "beats_check_2" CHECK(duration >= 0),
	CONSTRAINT "beats_check_3" CHECK(position >= 0),
	CONSTRAINT "beats_check_4" CHECK(include_in_measure IN (0, 1),
	CONSTRAINT "pages_check_5" CHECK(is_subset IN (0, 1),
	CONSTRAINT "field_properties_check_6" CHECK(id = 1),
	CONSTRAINT "utility_check_7" CHECK(id = 0),
	CONSTRAINT "utility_check_8" CHECK(last_page_counts >= 1)
);
--> statement-breakpoint
CREATE TABLE `shape_page_marchers` (
	`id` integer PRIMARY KEY,
	`shape_page_id` integer NOT NULL,
	`marcher_id` integer NOT NULL,
	`position_order` integer,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`notes` text,
	FOREIGN KEY (`marcher_id`) REFERENCES `marchers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`shape_page_id`) REFERENCES `shape_pages`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "history_stats_check_1" CHECK(id = 1),
	CONSTRAINT "beats_check_2" CHECK(duration >= 0),
	CONSTRAINT "beats_check_3" CHECK(position >= 0),
	CONSTRAINT "beats_check_4" CHECK(include_in_measure IN (0, 1),
	CONSTRAINT "pages_check_5" CHECK(is_subset IN (0, 1),
	CONSTRAINT "field_properties_check_6" CHECK(id = 1),
	CONSTRAINT "utility_check_7" CHECK(id = 0),
	CONSTRAINT "utility_check_8" CHECK(last_page_counts >= 1)
);
--> statement-breakpoint
CREATE INDEX `idx-spm-marcher_id` ON `shape_page_marchers` (`marcher_id`);--> statement-breakpoint
CREATE INDEX `idx-spm-shape_page_id` ON `shape_page_marchers` (`shape_page_id`);--> statement-breakpoint
CREATE TABLE `section_appearances` (
	`id` integer PRIMARY KEY,
	`section` text NOT NULL,
	`fill_color` text DEFAULT 'rgba(0, 0, 0, 1)' NOT NULL,
	`outline_color` text DEFAULT 'rgba(0, 0, 0, 1)' NOT NULL,
	`shape_type` text DEFAULT 'circle' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	CONSTRAINT "history_stats_check_1" CHECK(id = 1),
	CONSTRAINT "beats_check_2" CHECK(duration >= 0),
	CONSTRAINT "beats_check_3" CHECK(position >= 0),
	CONSTRAINT "beats_check_4" CHECK(include_in_measure IN (0, 1),
	CONSTRAINT "pages_check_5" CHECK(is_subset IN (0, 1),
	CONSTRAINT "field_properties_check_6" CHECK(id = 1),
	CONSTRAINT "utility_check_7" CHECK(id = 0),
	CONSTRAINT "utility_check_8" CHECK(last_page_counts >= 1)
);
--> statement-breakpoint
CREATE TABLE `utility` (
	`id` integer PRIMARY KEY,
	`last_page_counts` integer,
	CONSTRAINT "history_stats_check_1" CHECK(id = 1),
	CONSTRAINT "beats_check_2" CHECK(duration >= 0),
	CONSTRAINT "beats_check_3" CHECK(position >= 0),
	CONSTRAINT "beats_check_4" CHECK(include_in_measure IN (0, 1),
	CONSTRAINT "pages_check_5" CHECK(is_subset IN (0, 1),
	CONSTRAINT "field_properties_check_6" CHECK(id = 1),
	CONSTRAINT "utility_check_7" CHECK(id = 0),
	CONSTRAINT "utility_check_8" CHECK(last_page_counts >= 1)
);

*/