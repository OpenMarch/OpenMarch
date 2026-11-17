ALTER TABLE `items` ADD `model` text;--> statement-breakpoint
ALTER TABLE `items` ADD `locked` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `items` ADD `from_preset` integer DEFAULT false NOT NULL;