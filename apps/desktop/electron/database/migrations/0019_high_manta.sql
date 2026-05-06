CREATE TABLE `lighting_groups` (
	`id` integer PRIMARY KEY NOT NULL,
	`scene_id` integer NOT NULL,
	`name` text,
	FOREIGN KEY (`scene_id`) REFERENCES `lighting_scenes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `lighting_group_marchers` (
	`id` integer PRIMARY KEY NOT NULL,
	`group_id` integer NOT NULL,
	`marcher_id` integer NOT NULL,
	`scene_id` integer NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `lighting_groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`marcher_id`) REFERENCES `marchers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scene_id`) REFERENCES `lighting_scenes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lighting_group_marchers_group_id_marcher_id_unique` ON `lighting_group_marchers` (`group_id`,`marcher_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `lighting_group_marchers_scene_id_marcher_id_unique` ON `lighting_group_marchers` (`scene_id`,`marcher_id`);--> statement-breakpoint
DROP TABLE `marcher_lighting_effects`;--> statement-breakpoint
DELETE FROM `lighting_effects`;--> statement-breakpoint
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
	CONSTRAINT "lighting_effect_type_check" CHECK("__new_lighting_effects"."type" IN ('solid', 'strobe', 'fade')),
	CONSTRAINT "lighting_effect_start_offset_beats_check" CHECK("__new_lighting_effects"."start_offset_beats" >= 0),
	CONSTRAINT "lighting_effect_duration_beats_check" CHECK("__new_lighting_effects"."duration_beats" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_lighting_effects`("id", "scene_id", "type", "args", "name") SELECT "id", "scene_id", "type", "args", "name" FROM `lighting_effects`;--> statement-breakpoint
DROP TABLE `lighting_effects`;--> statement-breakpoint
ALTER TABLE `__new_lighting_effects` RENAME TO `lighting_effects`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `lighting_effect_groups` (
	`id` integer PRIMARY KEY NOT NULL,
	`lighting_effect_id` integer NOT NULL,
	`lighting_group_id` integer NOT NULL,
	FOREIGN KEY (`lighting_effect_id`) REFERENCES `lighting_effects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lighting_group_id`) REFERENCES `lighting_groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lighting_effect_groups_effect_group_unique` ON `lighting_effect_groups` (`lighting_effect_id`,`lighting_group_id`);
