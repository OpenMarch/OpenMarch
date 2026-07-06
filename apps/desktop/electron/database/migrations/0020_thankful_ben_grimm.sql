CREATE TABLE `lighting_effect_layers` (
	`id` integer PRIMARY KEY NOT NULL,
	`lighting_effect_id` integer NOT NULL,
	`top` real NOT NULL,
	`left` real NOT NULL,
	`height` real NOT NULL,
	`width` real NOT NULL,
	FOREIGN KEY (`lighting_effect_id`) REFERENCES `lighting_effects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "lighting_effect_layer_top_check" CHECK("lighting_effect_layers"."top" >= 0),
	CONSTRAINT "lighting_effect_layer_left_check" CHECK("lighting_effect_layers"."left" >= 0),
	CONSTRAINT "lighting_effect_layer_height_check" CHECK("lighting_effect_layers"."height" >= 0),
	CONSTRAINT "lighting_effect_layer_width_check" CHECK("lighting_effect_layers"."width" >= 0)
);
