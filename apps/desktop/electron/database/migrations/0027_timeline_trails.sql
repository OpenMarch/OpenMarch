-- Trails, pathways step 4 (spec I-T5′, R-9′, R-13′): a follow-the-leader transition may have a
-- trail route in place of a destination shape, so the I-T5 CHECK also accepts `route_id`. SQLite
-- can't change a CHECK in place, so timeline_transitions is rebuilt as 0024 did: drizzle-kit's
-- rebuild, checked by hand. Every column is copied (`route_id` too, which exists since 0024), ids
-- included, so every rowid, and with it every stored undo and redo step, is kept. Only
-- `timeline_transitions_ftl_shape_check` differs from the table 0024 made. Dropping the old table
-- drops its history triggers; the renderer recreates them on open (`createAllUndoTriggers`), and
-- the invariant and change-log triggers and views are rebuilt after every migration run. The
-- migration runner turns foreign keys off around each statement, so dropping the old table
-- deletes no assignment, destination or lane. The app writes file version 13 with a file's first
-- trail (`fileVersion.ts`).
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_timeline_transitions` (
	`id` integer PRIMARY KEY NOT NULL,
	`timeline_id` integer NOT NULL,
	`dest_shape_id` integer,
	`path_style` text DEFAULT 'direct' NOT NULL,
	`path_params` text,
	`route_id` integer,
	`order_mode` text DEFAULT 'inherit' NOT NULL,
	`slot_count` integer NOT NULL,
	`start_beat` integer NOT NULL,
	`end_beat` integer NOT NULL,
	FOREIGN KEY (`timeline_id`) REFERENCES `timelines`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`dest_shape_id`) REFERENCES `timeline_shapes`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`route_id`) REFERENCES `timeline_routes`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "timeline_transitions_timeline_id_type_check" CHECK(typeof(timeline_id) = 'integer'),
	CONSTRAINT "timeline_transitions_dest_shape_id_type_check" CHECK(dest_shape_id IS NULL OR typeof(dest_shape_id) = 'integer'),
	CONSTRAINT "timeline_transitions_path_style_check" CHECK(path_style IN ('direct', 'arc', 'follow_the_leader', 'route')),
	CONSTRAINT "timeline_transitions_path_params_check" CHECK(path_params IS NULL OR json_valid(path_params)),
	CONSTRAINT "timeline_transitions_order_mode_check" CHECK(order_mode IN ('inherit', 'slot')),
	CONSTRAINT "timeline_transitions_slot_count_type_check" CHECK(typeof(slot_count) = 'integer'),
	CONSTRAINT "timeline_transitions_slot_count_check" CHECK(slot_count BETWEEN 1 AND 10000),
	CONSTRAINT "timeline_transitions_start_beat_type_check" CHECK(typeof(start_beat) = 'integer'),
	CONSTRAINT "timeline_transitions_end_beat_type_check" CHECK(typeof(end_beat) = 'integer'),
	CONSTRAINT "timeline_transitions_start_beat_check" CHECK(start_beat BETWEEN 0 AND 2147483647),
	CONSTRAINT "timeline_transitions_end_beat_check" CHECK(end_beat BETWEEN 0 AND 2147483647),
	CONSTRAINT "timeline_transitions_range_check" CHECK(end_beat > start_beat),
	CONSTRAINT "timeline_transitions_ftl_shape_check" CHECK(dest_shape_id IS NOT NULL OR route_id IS NOT NULL OR path_style <> 'follow_the_leader'),
	CONSTRAINT "timeline_transitions_arc_bulge_check" CHECK(path_style <> 'arc' OR (coalesce(json_type(path_params, '$.bulge'), '') IN ('integer', 'real') AND abs(json_extract(path_params, '$.bulge')) <= 0.5)),
	CONSTRAINT "timeline_transitions_route_id_type_check" CHECK(route_id IS NULL OR typeof(route_id) = 'integer'),
	CONSTRAINT "timeline_transitions_route_check" CHECK(path_style <> 'route' OR (route_id IS NOT NULL AND dest_shape_id IS NULL AND slot_count = 1))
);
--> statement-breakpoint
INSERT INTO `__new_timeline_transitions`("id", "timeline_id", "dest_shape_id", "path_style", "path_params", "route_id", "order_mode", "slot_count", "start_beat", "end_beat") SELECT "id", "timeline_id", "dest_shape_id", "path_style", "path_params", "route_id", "order_mode", "slot_count", "start_beat", "end_beat" FROM `timeline_transitions`;--> statement-breakpoint
DROP TABLE `timeline_transitions`;--> statement-breakpoint
ALTER TABLE `__new_timeline_transitions` RENAME TO `timeline_transitions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `timeline_idx_tr_shape` ON `timeline_transitions` (`dest_shape_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `timeline_idx_tr_route` ON `timeline_transitions` (`route_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `timeline_idx_tr_timeline` ON `timeline_transitions` (`timeline_id`);