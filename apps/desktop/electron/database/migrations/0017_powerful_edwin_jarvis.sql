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
-- Marcher homes (C-5). Hand-edited from drizzle-kit's `__new_marchers` rebuild, whose
-- INSERT ... SELECT copied home_x/home_y from a table that doesn't have them yet. ADD COLUMN
-- leaves `marchers` and every row that references it untouched; the named CHECKs match the
-- snapshot, so `drizzle-kit generate` stays a no-op.
ALTER TABLE `marchers` ADD COLUMN `home_x` real DEFAULT 0 NOT NULL CONSTRAINT "marchers_home_x_type_check" CHECK(typeof(home_x) IN ('integer', 'real')) CONSTRAINT "marchers_home_x_check" CHECK(abs(home_x) <= 1e6);--> statement-breakpoint
ALTER TABLE `marchers` ADD COLUMN `home_y` real DEFAULT 0 NOT NULL CONSTRAINT "marchers_home_y_type_check" CHECK(typeof(home_y) IN ('integer', 'real')) CONSTRAINT "marchers_home_y_check" CHECK(abs(home_y) <= 1e6);
