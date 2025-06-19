-- This initial migration matches the output of v6.ts createTables() followed by v7.ts transitionToDrizzle()
CREATE TABLE `history_undo` (
	`sequence` integer PRIMARY KEY,
	`history_group` integer NOT NULL,
	`sql` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `history_redo` (
	`sequence` integer PRIMARY KEY,
	`history_group` integer NOT NULL,
	`sql` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `history_stats` (
	`id` integer PRIMARY KEY CHECK (id = 1),
	`cur_undo_group` integer NOT NULL,
	`cur_redo_group` integer NOT NULL,
	`group_limit` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `beats` (
	`id` integer PRIMARY KEY,
	`duration` float NOT NULL CHECK (duration >= 0),
	`position` integer NOT NULL UNIQUE CHECK (position >= 0),
	`include_in_measure` integer NOT NULL DEFAULT 1 CHECK (include_in_measure IN (0, 1)),
	`notes` text,
	`created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
INSERT INTO beats (duration, position, id) VALUES (0, 0, 0);
--> statement-breakpoint
CREATE TRIGGER prevent_beat_modification
	BEFORE UPDATE ON beats
	FOR EACH ROW
	WHEN OLD.id = 0
	BEGIN
		SELECT RAISE(FAIL, 'Modification not allowed for the first beat.');
	END;
--> statement-breakpoint
CREATE TRIGGER prevent_beat_deletion
	BEFORE DELETE ON beats
	FOR EACH ROW
	WHEN OLD.id = 0
	BEGIN
		SELECT RAISE(FAIL, 'Deletion not allowed for the first beat.');
	END;

--> statement-breakpoint
CREATE TABLE `measures` (
	`id` integer PRIMARY KEY,
	`start_beat` integer NOT NULL UNIQUE,
	`rehearsal_mark` text,
	`notes` text,
	`created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`start_beat`) REFERENCES `beats`(`id`)
);
--> statement-breakpoint
CREATE TABLE `pages` (
	`id` integer PRIMARY KEY,
	`is_subset` integer NOT NULL DEFAULT 0 CHECK (is_subset IN (0, 1)),
	`notes` text,
	`created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`start_beat` integer NOT NULL UNIQUE,
	FOREIGN KEY (`start_beat`) REFERENCES `beats`(`id`)
);
--> statement-breakpoint
INSERT INTO pages (start_beat, id) VALUES (0, 0);
--> statement-breakpoint
CREATE TRIGGER prevent_page_modification
	BEFORE UPDATE ON pages
	FOR EACH ROW
	WHEN OLD.id = 0
	BEGIN
		SELECT RAISE(FAIL, 'Modification not allowed for the first page.');
	END;
--> statement-breakpoint
CREATE TRIGGER prevent_page_deletion
	BEFORE DELETE ON pages
	FOR EACH ROW
	WHEN OLD.id = 0
	BEGIN
		SELECT RAISE(FAIL, 'Deletion not allowed for the first page.');
	END;
--> statement-breakpoint
CREATE TABLE `marchers` (
	`id` integer PRIMARY KEY,
	`name` text,
	`section` text NOT NULL,
	`year` text,
	`notes` text,
	`drill_prefix` text NOT NULL,
	`drill_order` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	UNIQUE (`drill_prefix`, `drill_order`)
);
--> statement-breakpoint
CREATE TABLE `marcher_pages` (
	`id` integer PRIMARY KEY,
	`id_for_html` text UNIQUE,
	`marcher_id` integer NOT NULL,
	`page_id` integer NOT NULL,
	`x` real,
	`y` real,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	`notes` text,
	FOREIGN KEY (`marcher_id`) REFERENCES `marchers`(`id`) ON DELETE cascade DEFERRABLE INITIALLY DEFERRED,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON DELETE cascade DEFERRABLE INITIALLY DEFERRED,
	UNIQUE (`marcher_id`, `page_id`)
);
--> statement-breakpoint
CREATE INDEX `index_marcher_pages_on_page_id` ON `marcher_pages` (`page_id`);--> statement-breakpoint
CREATE INDEX `index_marcher_pages_on_marcher_id` ON `marcher_pages` (`marcher_id`);--> statement-breakpoint
CREATE TABLE `field_properties` (
	`id` integer PRIMARY KEY CHECK (id = 1),
	`json_data` text NOT NULL,
	`image` blob
);
--> statement-breakpoint
CREATE TABLE `audio_files` (
	`id` integer PRIMARY KEY,
	`path` text NOT NULL,
	`nickname` text,
	`data` blob,
	`selected` integer NOT NULL DEFAULT 0,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `shapes` (
	`id` integer PRIMARY KEY,
	`name` text,
	`created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`notes` text
);
--> statement-breakpoint
CREATE TABLE `shape_pages` (
	`id` integer PRIMARY KEY,
	`shape_id` integer NOT NULL,
	`page_id` integer NOT NULL,
	`svg_path` text NOT NULL,
	`created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`notes` text,
	FOREIGN KEY (`shape_id`) REFERENCES `shapes`(`id`) ON DELETE cascade,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON DELETE cascade,
	UNIQUE (`shape_id`, `page_id`)
);
--> statement-breakpoint
CREATE TABLE `shape_page_marchers` (
	`id` integer PRIMARY KEY,
	`shape_page_id` integer NOT NULL REFERENCES `shape_pages`(`id`),
	`marcher_id` integer NOT NULL REFERENCES `marchers`(`id`),
	`position_order` integer,
	`created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`notes` text,
	FOREIGN KEY (`shape_page_id`) REFERENCES `shape_pages`(`id`) ON DELETE cascade,
	FOREIGN KEY (`marcher_id`) REFERENCES `marchers`(`id`) ON DELETE cascade,
	UNIQUE (`shape_page_id`, `position_order`),
	UNIQUE (`shape_page_id`, `marcher_id`)
);
--> statement-breakpoint
CREATE INDEX `idx-spm-marcher_id` ON `shape_page_marchers` (`marcher_id`);--> statement-breakpoint
CREATE INDEX `idx-spm-shape_page_id` ON `shape_page_marchers` (`shape_page_id`);--> statement-breakpoint
CREATE TABLE `section_appearances` (
	`id` integer PRIMARY KEY,
	`section` text NOT NULL UNIQUE,
	`fill_color` text NOT NULL DEFAULT 'rgba(0, 0, 0, 1)',
	`outline_color` text NOT NULL DEFAULT 'rgba(0, 0, 0, 1)',
	`shape_type` text NOT NULL DEFAULT 'circle',
	`created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `utility` (
	`id` integer PRIMARY KEY CHECK (id = 0),
	`last_page_counts` integer CHECK (last_page_counts >= 1)
);
--> statement-breakpoint
INSERT INTO `utility` (`id`, `last_page_counts`) VALUES (0, 8);
--> statement-breakpoint
CREATE TRIGGER `prevent_utility_deletion`
	BEFORE DELETE ON `utility`
	FOR EACH ROW
	WHEN OLD.id = 0
	BEGIN
		SELECT RAISE(FAIL, 'Deletion not allowed for the utility record.');
	END;


--> statement-breakpoint
INSERT INTO `history_stats` (`id`, `cur_undo_group`, `cur_redo_group`, `group_limit`) 
VALUES (1, 0, 0, 500);


-- TODO - seed with initial data
