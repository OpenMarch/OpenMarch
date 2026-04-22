PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_lighting_effects` (
	`id` integer PRIMARY KEY NOT NULL,
	`scene_id` integer NOT NULL,
	`type` text NOT NULL,
	`args` text DEFAULT '{}' NOT NULL,
	`name` text,
	`duration_seconds` real DEFAULT 1 NOT NULL,
	`sequence_index` integer NOT NULL,
	FOREIGN KEY (`scene_id`) REFERENCES `lighting_scenes`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "lighting_effect_type_check" CHECK("__new_lighting_effects"."type" IN ('solid', 'strobe', 'fade')),
	CONSTRAINT "lighting_effect_duration_seconds_check" CHECK("__new_lighting_effects"."duration_seconds" >= 0),
	CONSTRAINT "lighting_effect_sequence_index_check" CHECK("__new_lighting_effects"."sequence_index" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_lighting_effects`("id", "scene_id", "type", "args", "name", "duration_seconds", "sequence_index") SELECT "id", "scene_id", "type", "args", "name", 1 AS "duration_seconds", (ROW_NUMBER() OVER (PARTITION BY "scene_id" ORDER BY "id") - 1) AS "sequence_index" FROM `lighting_effects`;--> statement-breakpoint
DROP TABLE `lighting_effects`;--> statement-breakpoint
ALTER TABLE `__new_lighting_effects` RENAME TO `lighting_effects`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `lighting_effects_scene_id_sequence_index_unique` ON `lighting_effects` (`scene_id`,`sequence_index`);