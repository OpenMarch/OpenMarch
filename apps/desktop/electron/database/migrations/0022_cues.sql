-- A file can already hold `cues` and `cue_marchers` in another shape: fork builds from before the
-- merge with upstream made them (old 0022), and the fork-file repair drops them only from files it
-- repairs. Whatever is there is not this migration's, so it goes first, with its rows, indexes and
-- triggers. Never run this migration on a file that took it (under a new date, say): it would
-- delete the file's cues.
DROP TABLE IF EXISTS `cue_marchers`;
--> statement-breakpoint
DROP TABLE IF EXISTS `cues`;
--> statement-breakpoint
CREATE TABLE `cue_marchers` (
	`id` integer PRIMARY KEY NOT NULL,
	`cue_id` integer NOT NULL,
	`marcher_id` integer NOT NULL,
	FOREIGN KEY (`cue_id`) REFERENCES `cues`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`marcher_id`) REFERENCES `marchers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `cue_marchers_marcher_id_idx` ON `cue_marchers` (`marcher_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `cue_marchers_cue_marcher_unique` ON `cue_marchers` (`cue_id`,`marcher_id`);--> statement-breakpoint
CREATE TABLE `cues` (
	`id` integer PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`beat_id` integer NOT NULL,
	`value` text NOT NULL,
	`settings_json` text DEFAULT '{}' NOT NULL,
	`length` integer,
	`transition` integer,
	`label` text,
	`notes` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`beat_id`) REFERENCES `beats`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "cues_settings_json_check" CHECK(json_valid(settings_json)),
	CONSTRAINT "cues_length_check" CHECK(length IS NULL OR (typeof(length) = 'integer' AND length >= 1)),
	CONSTRAINT "cues_transition_check" CHECK(transition IS NULL OR (typeof(transition) = 'integer' AND transition >= 1))
);
--> statement-breakpoint
CREATE INDEX `cues_beat_id_idx` ON `cues` (`beat_id`);--> statement-breakpoint
CREATE INDEX `cues_type_beat_id_idx` ON `cues` (`type`,`beat_id`);