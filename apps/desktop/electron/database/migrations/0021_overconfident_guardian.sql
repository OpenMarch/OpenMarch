PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_lighting_effects` (
	`id` integer PRIMARY KEY NOT NULL,
	`scene_id` integer NOT NULL,
	`type` text NOT NULL,
	`args` text DEFAULT '{}' NOT NULL,
	`name` text,
	`start_offset_beats` integer DEFAULT 0 NOT NULL,
	`duration_beats` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`scene_id`) REFERENCES `lighting_scenes`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "lighting_effect_type_check" CHECK("__new_lighting_effects"."type" IN ('solid', 'strobe', 'fade', 'wipe')),
	CONSTRAINT "lighting_effect_start_offset_beats_check" CHECK("__new_lighting_effects"."start_offset_beats" >= 0),
	CONSTRAINT "lighting_effect_duration_beats_check" CHECK("__new_lighting_effects"."duration_beats" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_lighting_effects`("id", "scene_id", "type", "args", "name", "start_offset_beats", "duration_beats") SELECT "id", "scene_id", "type", "args", "name", "start_offset_beats", "duration_beats" FROM `lighting_effects`;--> statement-breakpoint
DROP TABLE `lighting_effects`;--> statement-breakpoint
ALTER TABLE `__new_lighting_effects` RENAME TO `lighting_effects`;--> statement-breakpoint
PRAGMA foreign_keys=ON;