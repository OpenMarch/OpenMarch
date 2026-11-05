CREATE TABLE `item_geometry` (
	`id` integer PRIMARY KEY NOT NULL,
	`item_id` integer NOT NULL,
	`beat_id` integer NOT NULL,
	`outline_type` text NOT NULL,
	`width` real NOT NULL,
	`depth` real NOT NULL,
	`height` real DEFAULT 0 NOT NULL,
	`rotation` real DEFAULT 0 NOT NULL,
	`custom_outline` text,
	`transition_length` integer DEFAULT 1 NOT NULL,
	`rolls_out` integer DEFAULT 0 NOT NULL,
	`leading_edge` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`beat_id`) REFERENCES `beats`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "item_geometry_outline_type_check" CHECK(outline_type IN ('rectangle', 'circle', 'arc', 'polygon', 'freehand')),
	CONSTRAINT "item_geometry_size_check" CHECK(width > 0 AND depth > 0 AND height >= 0),
	CONSTRAINT "item_geometry_transition_check" CHECK(typeof(transition_length) = 'integer' AND transition_length >= 1),
	CONSTRAINT "item_geometry_custom_outline_check" CHECK(custom_outline IS NULL OR json_valid(custom_outline)),
	CONSTRAINT "item_geometry_rolls_out_check" CHECK((rolls_out = 0 AND leading_edge IS NULL) OR (rolls_out = 1 AND leading_edge IS NOT NULL AND leading_edge IN ('front', 'back', 'left', 'right')))
);
--> statement-breakpoint
CREATE INDEX `item_geometry_beat_id_idx` ON `item_geometry` (`beat_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `item_geometry_item_beat_unique` ON `item_geometry` (`item_id`,`beat_id`);--> statement-breakpoint
CREATE TABLE `items` (
	`id` integer PRIMARY KEY NOT NULL,
	`marcher_id` integer NOT NULL,
	`kind` text NOT NULL,
	`surface_type` text,
	`color` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`marcher_id`) REFERENCES `marchers`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "items_kind_check" CHECK(kind IN ('prop', 'equipment')),
	CONSTRAINT "items_surface_type_check" CHECK((kind = 'prop' AND surface_type IS NOT NULL AND surface_type IN ('floor', 'platform', 'obstacle')) OR (kind = 'equipment' AND surface_type IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `items_marcher_id_unique` ON `items` (`marcher_id`);--> statement-breakpoint
CREATE TABLE `tempo_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`audio_offset_seconds` real,
	CONSTRAINT "tempo_settings_id_check" CHECK(id = 0)
);
--> statement-breakpoint
CREATE TABLE `timeline_assignments` (
	`id` integer PRIMARY KEY NOT NULL,
	`marcher_id` integer NOT NULL,
	`transition_id` integer NOT NULL,
	`slot_index` integer NOT NULL,
	`start_beat` integer NOT NULL,
	`end_beat` integer NOT NULL,
	`layer` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`marcher_id`) REFERENCES `marchers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`transition_id`) REFERENCES `timeline_transitions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "timeline_assignments_marcher_id_type_check" CHECK(typeof(marcher_id) = 'integer'),
	CONSTRAINT "timeline_assignments_transition_id_type_check" CHECK(typeof(transition_id) = 'integer'),
	CONSTRAINT "timeline_assignments_slot_index_type_check" CHECK(typeof(slot_index) = 'integer'),
	CONSTRAINT "timeline_assignments_slot_index_check" CHECK(slot_index >= 0),
	CONSTRAINT "timeline_assignments_start_beat_type_check" CHECK(typeof(start_beat) = 'integer'),
	CONSTRAINT "timeline_assignments_end_beat_type_check" CHECK(typeof(end_beat) = 'integer'),
	CONSTRAINT "timeline_assignments_start_beat_check" CHECK(start_beat BETWEEN 0 AND 2147483647),
	CONSTRAINT "timeline_assignments_end_beat_check" CHECK(end_beat BETWEEN 0 AND 2147483647),
	CONSTRAINT "timeline_assignments_range_check" CHECK(end_beat > start_beat),
	CONSTRAINT "timeline_assignments_layer_type_check" CHECK(typeof(layer) = 'integer'),
	CONSTRAINT "timeline_assignments_layer_check" CHECK(layer BETWEEN -1000 AND 1000)
);
--> statement-breakpoint
CREATE INDEX `timeline_idx_asn_marcher` ON `timeline_assignments` (`marcher_id`,`start_beat`);--> statement-breakpoint
CREATE UNIQUE INDEX `timeline_assignments_transition_slot_unique` ON `timeline_assignments` (`transition_id`,`slot_index`);--> statement-breakpoint
CREATE UNIQUE INDEX `timeline_assignments_transition_marcher_unique` ON `timeline_assignments` (`transition_id`,`marcher_id`);--> statement-breakpoint
CREATE TABLE `timeline_change_log` (
	`seq` integer PRIMARY KEY NOT NULL,
	`tbl` text NOT NULL,
	`row_id` integer NOT NULL,
	`before` text,
	`after` text
);
--> statement-breakpoint
CREATE TABLE `timeline_held_marks` (
	`id` integer PRIMARY KEY NOT NULL,
	`marcher_id` integer NOT NULL,
	`start_beat` integer NOT NULL,
	`end_beat` integer NOT NULL,
	FOREIGN KEY (`marcher_id`) REFERENCES `marchers`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "timeline_held_marks_start_beat_check" CHECK(typeof(start_beat) = 'integer' AND start_beat >= 0),
	CONSTRAINT "timeline_held_marks_end_beat_check" CHECK(typeof(end_beat) = 'integer' AND end_beat > start_beat)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `timeline_held_marks_marcher_id_start_beat_unique` ON `timeline_held_marks` (`marcher_id`,`start_beat`);--> statement-breakpoint
CREATE TABLE `timeline_shape_recipe_marchers` (
	`id` integer PRIMARY KEY NOT NULL,
	`recipe_id` integer NOT NULL,
	`marcher_id` integer NOT NULL,
	`slot` integer NOT NULL,
	`x` real NOT NULL,
	`y` real NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `timeline_shape_recipes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`marcher_id`) REFERENCES `marchers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `timeline_shape_recipe_marchers_marcher` ON `timeline_shape_recipe_marchers` (`marcher_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `timeline_shape_recipe_marchers_recipe_id_marcher_id_unique` ON `timeline_shape_recipe_marchers` (`recipe_id`,`marcher_id`);--> statement-breakpoint
CREATE TABLE `timeline_shape_recipes` (
	`id` integer PRIMARY KEY NOT NULL,
	`timeline_id` integer,
	`kind` text NOT NULL,
	`kind_version` integer NOT NULL,
	`params` text NOT NULL,
	`order_mode` text NOT NULL,
	`reverse` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`timeline_id`) REFERENCES `timelines`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "timeline_shape_recipes_params_check" CHECK(json_valid(params))
);
--> statement-breakpoint
CREATE TABLE `timeline_shapes` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text,
	`kind` text NOT NULL,
	`geometry` text NOT NULL,
	CONSTRAINT "timeline_shapes_kind_check" CHECK(kind IN ('line', 'freehand', 'circle', 'box', 'block')),
	CONSTRAINT "timeline_shapes_geometry_check" CHECK(json_valid(geometry)),
	CONSTRAINT "timeline_shapes_circle_check" CHECK(kind <> 'circle' OR (coalesce(json_type(geometry, '$.radius'), '') IN ('integer', 'real') AND json_extract(geometry, '$.radius') > 0 AND json_extract(geometry, '$.radius') <= 1e6 AND coalesce(json_type(geometry, '$.start_angle'), '') IN ('integer', 'real') AND json_extract(geometry, '$.start_angle') >= 0 AND json_extract(geometry, '$.start_angle') < 6.283185307179586))
);
--> statement-breakpoint
CREATE TABLE `timeline_slot_destinations` (
	`id` integer PRIMARY KEY NOT NULL,
	`transition_id` integer NOT NULL,
	`slot_index` integer NOT NULL,
	`x` real NOT NULL,
	`y` real NOT NULL,
	FOREIGN KEY (`transition_id`) REFERENCES `timeline_transitions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "timeline_slot_destinations_transition_id_type_check" CHECK(typeof(transition_id) = 'integer'),
	CONSTRAINT "timeline_slot_destinations_slot_index_type_check" CHECK(typeof(slot_index) = 'integer'),
	CONSTRAINT "timeline_slot_destinations_slot_index_check" CHECK(slot_index >= 0),
	CONSTRAINT "timeline_slot_destinations_x_type_check" CHECK(typeof(x) IN ('integer', 'real')),
	CONSTRAINT "timeline_slot_destinations_x_check" CHECK(abs(x) <= 1e6),
	CONSTRAINT "timeline_slot_destinations_y_type_check" CHECK(typeof(y) IN ('integer', 'real')),
	CONSTRAINT "timeline_slot_destinations_y_check" CHECK(abs(y) <= 1e6)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `timeline_slot_destinations_transition_slot_unique` ON `timeline_slot_destinations` (`transition_id`,`slot_index`);--> statement-breakpoint
CREATE TABLE `timeline_transitions` (
	`id` integer PRIMARY KEY NOT NULL,
	`timeline_id` integer NOT NULL,
	`dest_shape_id` integer,
	`path_style` text DEFAULT 'direct' NOT NULL,
	`path_params` text,
	`order_mode` text DEFAULT 'inherit' NOT NULL,
	`slot_count` integer NOT NULL,
	`start_beat` integer NOT NULL,
	`end_beat` integer NOT NULL,
	FOREIGN KEY (`timeline_id`) REFERENCES `timelines`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`dest_shape_id`) REFERENCES `timeline_shapes`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "timeline_transitions_timeline_id_type_check" CHECK(typeof(timeline_id) = 'integer'),
	CONSTRAINT "timeline_transitions_dest_shape_id_type_check" CHECK(dest_shape_id IS NULL OR typeof(dest_shape_id) = 'integer'),
	CONSTRAINT "timeline_transitions_path_style_check" CHECK(path_style IN ('direct', 'arc', 'follow_the_leader')),
	CONSTRAINT "timeline_transitions_path_params_check" CHECK(path_params IS NULL OR json_valid(path_params)),
	CONSTRAINT "timeline_transitions_order_mode_check" CHECK(order_mode IN ('inherit', 'slot')),
	CONSTRAINT "timeline_transitions_slot_count_type_check" CHECK(typeof(slot_count) = 'integer'),
	CONSTRAINT "timeline_transitions_slot_count_check" CHECK(slot_count BETWEEN 1 AND 10000),
	CONSTRAINT "timeline_transitions_start_beat_type_check" CHECK(typeof(start_beat) = 'integer'),
	CONSTRAINT "timeline_transitions_end_beat_type_check" CHECK(typeof(end_beat) = 'integer'),
	CONSTRAINT "timeline_transitions_start_beat_check" CHECK(start_beat BETWEEN 0 AND 2147483647),
	CONSTRAINT "timeline_transitions_end_beat_check" CHECK(end_beat BETWEEN 0 AND 2147483647),
	CONSTRAINT "timeline_transitions_range_check" CHECK(end_beat > start_beat),
	CONSTRAINT "timeline_transitions_ftl_shape_check" CHECK(dest_shape_id IS NOT NULL OR path_style <> 'follow_the_leader'),
	CONSTRAINT "timeline_transitions_arc_bulge_check" CHECK(path_style <> 'arc' OR (coalesce(json_type(path_params, '$.bulge'), '') IN ('integer', 'real') AND abs(json_extract(path_params, '$.bulge')) <= 0.5))
);
--> statement-breakpoint
CREATE INDEX `timeline_idx_tr_shape` ON `timeline_transitions` (`dest_shape_id`);--> statement-breakpoint
CREATE INDEX `timeline_idx_tr_timeline` ON `timeline_transitions` (`timeline_id`);--> statement-breakpoint
CREATE TABLE `timelines` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text,
	`start_beat` integer NOT NULL,
	`end_beat` integer NOT NULL,
	CONSTRAINT "timelines_start_beat_type_check" CHECK(typeof(start_beat) = 'integer'),
	CONSTRAINT "timelines_end_beat_type_check" CHECK(typeof(end_beat) = 'integer'),
	CONSTRAINT "timelines_start_beat_check" CHECK(start_beat BETWEEN 0 AND 2147483647),
	CONSTRAINT "timelines_end_beat_check" CHECK(end_beat BETWEEN 0 AND 2147483647),
	CONSTRAINT "timelines_range_check" CHECK(end_beat > start_beat)
);
--> statement-breakpoint
CREATE TABLE `view3d_cameras` (
	`id` integer PRIMARY KEY NOT NULL,
	`json_data` text NOT NULL,
	CONSTRAINT "view3d_cameras_id_check" CHECK(id = 1)
);
--> statement-breakpoint
CREATE TABLE `view3d_venue` (
	`id` integer PRIMARY KEY NOT NULL,
	`json_data` text NOT NULL,
	CONSTRAINT "view3d_venue_id_check" CHECK(id = 1)
);
--> statement-breakpoint
ALTER TABLE `beats` ADD `tempo_hold` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `beats` ADD `tempo_change` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Hand-edited from drizzle-kit's `__new_marchers` rebuild, whose INSERT ... SELECT copied the new
-- columns from a table that doesn't have them yet. ADD COLUMN leaves `marchers` and every row that
-- references it untouched (a page-era file runs this before its conversion reads those rows). The
-- named CHECKs match the snapshot, so `drizzle-kit generate` stays a no-op. The statements are the
-- ones fork builds ran (old 0017 and 0024), so a fork file repaired on open ends with the same
-- table text as a new file (`legacyForkRepair.ts`). Existing rows are performers at home 0, 0.
ALTER TABLE `marchers` ADD COLUMN `home_x` real DEFAULT 0 NOT NULL CONSTRAINT "marchers_home_x_type_check" CHECK(typeof(home_x) IN ('integer', 'real')) CONSTRAINT "marchers_home_x_check" CHECK(abs(home_x) <= 1e6);--> statement-breakpoint
ALTER TABLE `marchers` ADD COLUMN `home_y` real DEFAULT 0 NOT NULL CONSTRAINT "marchers_home_y_type_check" CHECK(typeof(home_y) IN ('integer', 'real')) CONSTRAINT "marchers_home_y_check" CHECK(abs(home_y) <= 1e6);--> statement-breakpoint
ALTER TABLE `marchers` ADD COLUMN `type` text DEFAULT 'marcher' NOT NULL CONSTRAINT "marchers_type_check" CHECK(type IN ('marcher', 'item'));--> statement-breakpoint
ALTER TABLE `measures` ADD `number_override` integer;--> statement-breakpoint
ALTER TABLE `measures` ADD `meter` text;--> statement-breakpoint
ALTER TABLE `measures` ADD `grouping` text;