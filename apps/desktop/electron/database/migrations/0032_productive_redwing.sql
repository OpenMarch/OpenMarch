CREATE TABLE `tempo_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`audio_offset_seconds` real,
	CONSTRAINT "tempo_settings_id_check" CHECK(id = 0)
);
--> statement-breakpoint
ALTER TABLE `beats` ADD `tempo_hold` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `beats` ADD `tempo_change` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `measures` ADD `number_override` integer;--> statement-breakpoint
ALTER TABLE `measures` ADD `meter` text;--> statement-breakpoint
ALTER TABLE `measures` ADD `grouping` text;