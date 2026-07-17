PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_prop_page_geometry` (
	`id` integer PRIMARY KEY NOT NULL,
	`marcher_page_id` integer NOT NULL,
	`shape_type` text DEFAULT 'rectangle' NOT NULL,
	`width` real NOT NULL,
	`height` real NOT NULL,
	`custom_geometry` text,
	`rotation` real DEFAULT 0 NOT NULL,
	`visible` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`marcher_page_id`) REFERENCES `marcher_pages`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "prop_page_geometry_width_check" CHECK(width > 0),
	CONSTRAINT "prop_page_geometry_height_check" CHECK(height > 0)
);
--> statement-breakpoint
INSERT INTO `__new_prop_page_geometry`("id", "marcher_page_id", "shape_type", "width", "height", "custom_geometry", "rotation", "visible", "created_at", "updated_at") SELECT "id", "marcher_page_id", "shape_type", "width", "height", "custom_geometry", "rotation", "visible", "created_at", "updated_at" FROM `prop_page_geometry`;--> statement-breakpoint
DROP TABLE `prop_page_geometry`;--> statement-breakpoint
ALTER TABLE `__new_prop_page_geometry` RENAME TO `prop_page_geometry`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `prop_page_geometry_marcher_page_id_unique` ON `prop_page_geometry` (`marcher_page_id`);--> statement-breakpoint
CREATE INDEX `idx_prop_page_geometry_mp_id` ON `prop_page_geometry` (`marcher_page_id`);--> statement-breakpoint
CREATE TABLE `__new_marchers` (
	`id` integer PRIMARY KEY NOT NULL,
	`type` text DEFAULT 'marcher' NOT NULL,
	`name` text,
	`section` text NOT NULL,
	`year` text,
	`notes` text,
	`drill_prefix` text NOT NULL,
	`drill_order` integer NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	CONSTRAINT "marchers_type_check" CHECK(type IN ('marcher', 'prop'))
);
--> statement-breakpoint
INSERT INTO `__new_marchers`("id", "type", "name", "section", "year", "notes", "drill_prefix", "drill_order", "created_at", "updated_at") SELECT "id", "type", "name", "section", "year", "notes", "drill_prefix", "drill_order", "created_at", "updated_at" FROM `marchers`;--> statement-breakpoint
DROP TABLE `marchers`;--> statement-breakpoint
ALTER TABLE `__new_marchers` RENAME TO `marchers`;--> statement-breakpoint
CREATE UNIQUE INDEX `marchers_drill_prefix_drill_order_unique` ON `marchers` (`drill_prefix`,`drill_order`);