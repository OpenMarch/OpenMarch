CREATE TABLE `lighting_effects` (
	`id` integer PRIMARY KEY NOT NULL,
	`scene_id` integer NOT NULL,
	`type` text NOT NULL,
	`args` text DEFAULT '{}' NOT NULL,
	`name` text,
	FOREIGN KEY (`scene_id`) REFERENCES `lighting_scenes`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "lighting_effect_type_check" CHECK("lighting_effects"."type" IN ('solid', 'strobe', 'fade'))
);
--> statement-breakpoint
CREATE TABLE `lighting_scenes` (
	`id` integer PRIMARY KEY NOT NULL,
	`start_page_id` integer NOT NULL,
	`name` text,
	FOREIGN KEY (`start_page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `marcher_lighting_effects` (
	`id` integer PRIMARY KEY NOT NULL,
	`lighting_effect_id` integer NOT NULL,
	`marcher_id` integer NOT NULL,
	FOREIGN KEY (`lighting_effect_id`) REFERENCES `lighting_effects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`marcher_id`) REFERENCES `marchers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `marcher_lighting_effects_lighting_effect_id_marcher_id_unique` ON `marcher_lighting_effects` (`lighting_effect_id`,`marcher_id`);