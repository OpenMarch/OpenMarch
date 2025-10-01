PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_utility` (
	`id` integer PRIMARY KEY NOT NULL,
	`last_page_counts` integer DEFAULT 8 NOT NULL,
	`default_beat_duration` real DEFAULT 0.5 NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	CONSTRAINT "utility_last_page_counts_check" CHECK(last_page_counts > 0),
	CONSTRAINT "utility_id_check" CHECK(id = 0),
	CONSTRAINT "utility_default_beat_duration_check" CHECK(default_beat_duration > 0)
);
--> statement-breakpoint
INSERT INTO `__new_utility`("id", "last_page_counts", "updated_at") SELECT "id", "last_page_counts", "updated_at" FROM `utility`;--> statement-breakpoint
DROP TABLE `utility`;--> statement-breakpoint
ALTER TABLE `__new_utility` RENAME TO `utility`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
