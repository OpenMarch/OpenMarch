PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_midsets` (
	`id` integer PRIMARY KEY NOT NULL,
	`mp_id` integer NOT NULL,
	`x` real NOT NULL,
	`y` real NOT NULL,
	`progress_placement` real NOT NULL,
	`created_at` text DEFAULT 'sql`(CURRENT_TIMESTAMP)`' NOT NULL,
	`updated_at` text DEFAULT 'sql`(CURRENT_TIMESTAMP)`' NOT NULL,
	`path_data_id` integer,
	`path_position` real,
	`notes` text,
	FOREIGN KEY (`mp_id`) REFERENCES `marcher_pages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`path_data_id`) REFERENCES `pathways`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "midsets_path_data_position_check" CHECK(path_position >= 0 AND path_position <= 1),
	CONSTRAINT "placement_check" CHECK(progress_placement > 0 AND progress_placement < 1)
);
--> statement-breakpoint
INSERT INTO `__new_midsets`("id", "x", "y", "created_at", "updated_at", "path_data_id", "path_position", "notes") SELECT "id", "x", "y",  "created_at", "updated_at", "path_data_id", "path_position", "notes" FROM `midsets`;--> statement-breakpoint
DROP TABLE `midsets`;--> statement-breakpoint
ALTER TABLE `__new_midsets` RENAME TO `midsets`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `midsets_mp_id_progress_placement_unique` ON `midsets` (`mp_id`,`progress_placement`);
