PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_props` (
	`id` integer PRIMARY KEY NOT NULL,
	`marcher_id` integer NOT NULL,
	`surface_type` text DEFAULT 'obstacle' NOT NULL,
	`image` blob,
	`image_opacity` real DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`marcher_id`) REFERENCES `marchers`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "props_image_opacity_check" CHECK(image_opacity >= 0 AND image_opacity <= 1)
);
--> statement-breakpoint
INSERT INTO `__new_props`("id", "marcher_id", "surface_type", "image", "image_opacity", "created_at", "updated_at") SELECT "id", "marcher_id", "surface_type", "image", "image_opacity", "created_at", "updated_at" FROM `props`;--> statement-breakpoint
DROP TABLE `props`;--> statement-breakpoint
ALTER TABLE `__new_props` RENAME TO `props`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `props_marcher_id_unique` ON `props` (`marcher_id`);--> statement-breakpoint
CREATE INDEX `idx_props_marcher_id` ON `props` (`marcher_id`);