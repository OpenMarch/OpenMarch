ALTER TABLE `marcher_pages` ADD `fill_color` text;--> statement-breakpoint
ALTER TABLE `marcher_pages` ADD `outline_color` text;--> statement-breakpoint
ALTER TABLE `marcher_pages` ADD `shape_type` text;--> statement-breakpoint
ALTER TABLE `marcher_pages` ADD `visible` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `marcher_pages` ADD `label_visible` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `marcher_pages` ADD `equipment_name` text;--> statement-breakpoint
ALTER TABLE `marcher_pages` ADD `equipment_state` text;