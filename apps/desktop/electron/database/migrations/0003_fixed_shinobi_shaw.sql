CREATE TABLE `pathways` (
	`id` integer PRIMARY KEY NOT NULL,
	`svg_path` text NOT NULL,
	`notes` text
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_marcher_pages` (
	`id` integer PRIMARY KEY NOT NULL,
	`id_for_html` text,
	`marcher_id` integer NOT NULL,
	`page_id` integer NOT NULL,
	`x` real,
	`y` real,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`svg_path` integer,
	`svg_position` real,
	`notes` text,
	FOREIGN KEY (`marcher_id`) REFERENCES `marchers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`svg_path`) REFERENCES `pathways`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "marcher_pages_svg_path_position_check" CHECK(svg_position >= 0 AND svg_position <= 1)
);
--> statement-breakpoint
INSERT INTO `__new_marcher_pages`("id", "id_for_html", "marcher_id", "page_id", "x", "y", "created_at", "updated_at", "svg_path", "notes") SELECT "id", "id_for_html", "marcher_id", "page_id", "x", "y", "created_at", "updated_at", "svg_path", "notes" FROM `marcher_pages`;--> statement-breakpoint
DROP TABLE `marcher_pages`;--> statement-breakpoint
ALTER TABLE `__new_marcher_pages` RENAME TO `marcher_pages`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `index_marcher_pages_on_page_id` ON `marcher_pages` (`page_id`);--> statement-breakpoint
CREATE INDEX `index_marcher_pages_on_marcher_id` ON `marcher_pages` (`marcher_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `marcher_pages_marcher_id_page_id_unique` ON `marcher_pages` (`marcher_id`,`page_id`);--> statement-breakpoint
CREATE TABLE `__new_midsets` (
	`id` integer PRIMARY KEY NOT NULL,
	`page_id` integer NOT NULL,
	`x` real NOT NULL,
	`y` real NOT NULL,
	`placement` real NOT NULL,
	`created_at` text DEFAULT 'sql`(CURRENT_TIMESTAMP)`' NOT NULL,
	`updated_at` text DEFAULT 'sql`(CURRENT_TIMESTAMP)`' NOT NULL,
	`svg_path` integer,
	`svg_position` real,
	`notes` text,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`svg_path`) REFERENCES `pathways`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "midsets_svg_path_position_check" CHECK(svg_position >= 0 AND svg_position <= 1),
	CONSTRAINT "placement_check" CHECK(placement > 0 AND placement < 1)
);
--> statement-breakpoint
INSERT INTO `__new_midsets`("id", "page_id", "x", "y", "placement", "created_at", "updated_at", "svg_path", "notes") SELECT "id", "page_id", "x", "y", "placement", "created_at", "updated_at", "svg_path", "notes" FROM `midsets`;--> statement-breakpoint
DROP TABLE `midsets`;--> statement-breakpoint
ALTER TABLE `__new_midsets` RENAME TO `midsets`;--> statement-breakpoint
CREATE UNIQUE INDEX `midsets_page_id_placement_unique` ON `midsets` (`page_id`,`placement`);
