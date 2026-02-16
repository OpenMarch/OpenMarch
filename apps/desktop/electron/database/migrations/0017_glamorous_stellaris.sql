CREATE TABLE `prop_page_geometry` (
	`id` integer PRIMARY KEY NOT NULL,
	`marcher_page_id` integer NOT NULL,
	`shape_type` text DEFAULT 'rectangle' NOT NULL,
	`width` real NOT NULL,
	`height` real NOT NULL,
	`radius` real,
	`custom_geometry` text,
	`rotation` real DEFAULT 0 NOT NULL,
	`visible` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`marcher_page_id`) REFERENCES `marcher_pages`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "prop_page_geometry_width_check" CHECK(width > 0),
	CONSTRAINT "prop_page_geometry_height_check" CHECK(height > 0),
	CONSTRAINT "prop_page_geometry_radius_check" CHECK(radius IS NULL OR radius > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prop_page_geometry_marcher_page_id_unique` ON `prop_page_geometry` (`marcher_page_id`);--> statement-breakpoint
CREATE INDEX `idx_prop_page_geometry_mp_id` ON `prop_page_geometry` (`marcher_page_id`);--> statement-breakpoint
CREATE TABLE `props` (
	`id` integer PRIMARY KEY NOT NULL,
	`marcher_id` integer NOT NULL,
	`surface_type` text DEFAULT 'obstacle' NOT NULL,
	`asset_url` text,
	`prop_category` text,
	`default_width` real,
	`default_height` real,
	`image` blob,
	`image_opacity` real DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`marcher_id`) REFERENCES `marchers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `props_marcher_id_unique` ON `props` (`marcher_id`);--> statement-breakpoint
CREATE INDEX `idx_props_marcher_id` ON `props` (`marcher_id`);--> statement-breakpoint
ALTER TABLE `marchers` ADD `type` text DEFAULT 'marcher' NOT NULL;