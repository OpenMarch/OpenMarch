CREATE TABLE IF NOT EXISTS `timeline_held_marks` (
	`id` integer PRIMARY KEY NOT NULL,
	`marcher_id` integer NOT NULL,
	`start_beat` integer NOT NULL,
	`end_beat` integer NOT NULL,
	FOREIGN KEY (`marcher_id`) REFERENCES `marchers`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "timeline_held_marks_start_beat_check" CHECK(typeof(start_beat) = 'integer' AND start_beat >= 0),
	CONSTRAINT "timeline_held_marks_end_beat_check" CHECK(typeof(end_beat) = 'integer' AND end_beat > start_beat)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `timeline_held_marks_marcher_id_start_beat_unique` ON `timeline_held_marks` (`marcher_id`,`start_beat`);