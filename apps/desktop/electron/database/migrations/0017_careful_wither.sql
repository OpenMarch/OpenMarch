ALTER TABLE `marcher_pages` ADD `coordinate_mode` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `marcher_pages` SET `coordinate_mode` = 0;