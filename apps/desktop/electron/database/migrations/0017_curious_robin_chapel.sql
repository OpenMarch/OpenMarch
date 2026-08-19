ALTER TABLE `pages` ADD `is_coordinate_anchor` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `pages` SET `is_coordinate_anchor` = 1;