PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_section_appearances` (
	`id` integer PRIMARY KEY NOT NULL,
	`section` text NOT NULL,
	`fill_color` text,
	`outline_color` text,
	`shape_type` text,
	`visible` integer DEFAULT 1 NOT NULL,
	`label_visible` integer DEFAULT 1 NOT NULL,
	`equipment_name` text,
	`equipment_state` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_section_appearances`("id", "section", "fill_color", "outline_color", "shape_type", "created_at", "updated_at") SELECT "id", "section", "fill_color", "outline_color", "shape_type", "created_at", "updated_at" FROM `section_appearances`;--> statement-breakpoint
DROP TABLE `section_appearances`;--> statement-breakpoint
ALTER TABLE `__new_section_appearances` RENAME TO `section_appearances`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `tag_appearances` ADD `equipment_name` text;--> statement-breakpoint
ALTER TABLE `tag_appearances` ADD `equipment_state` text;
