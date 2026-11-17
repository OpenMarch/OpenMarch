-- Lanes, pathways step 24 (ADR 0015, spec v0.10 J.1): a slot walks a route through a lane, so a
-- path no longer moves marchers out of their move. A new table only; nothing is rebuilt.
-- Hand-edited after drizzle-kit's CREATE: a file that step 15 (fork lab builds) wrote has
-- `route` transitions, each a one-slot breakout (I-R2). Each becomes a lane on its slot 0, with
-- its `path_params` offset (NULL for an own path), and the transition goes `direct` with no
-- params and no route (I-R2′), so it plays exactly as before (QA-MIG-L2). Those files' undo and
-- redo steps name the old storage, so they are cleared with it; a file with no route (every
-- release file) keeps its history and is otherwise untouched. The app writes file version 11
-- once a file has a lane (`fileVersion.ts`). Like 0024 it also runs, unrecorded, on a page-era
-- file before its conversion (`CONVERTER_SCHEMA_MIGRATION_TAGS`), so it is safe to run twice:
-- IF NOT EXISTS, and a converting file has no route transitions to move.
CREATE TABLE IF NOT EXISTS `timeline_lanes` (
	`id` integer PRIMARY KEY NOT NULL,
	`transition_id` integer NOT NULL,
	`slot_index` integer NOT NULL,
	`route_id` integer NOT NULL,
	`offset_x` real,
	`offset_y` real,
	FOREIGN KEY (`transition_id`) REFERENCES `timeline_transitions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`route_id`) REFERENCES `timeline_routes`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "timeline_lanes_transition_id_type_check" CHECK(typeof(transition_id) = 'integer'),
	CONSTRAINT "timeline_lanes_slot_index_type_check" CHECK(typeof(slot_index) = 'integer'),
	CONSTRAINT "timeline_lanes_route_id_type_check" CHECK(typeof(route_id) = 'integer'),
	CONSTRAINT "timeline_lanes_slot_index_check" CHECK(slot_index >= 0),
	CONSTRAINT "timeline_lanes_offset_x_check" CHECK(offset_x IS NULL OR (typeof(offset_x) IN ('integer', 'real') AND offset_x BETWEEN -2000000 AND 2000000)),
	CONSTRAINT "timeline_lanes_offset_y_check" CHECK(offset_y IS NULL OR (typeof(offset_y) IN ('integer', 'real') AND offset_y BETWEEN -2000000 AND 2000000)),
	CONSTRAINT "timeline_lanes_offset_check" CHECK((offset_x IS NULL) = (offset_y IS NULL))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `timeline_idx_lane_route` ON `timeline_lanes` (`route_id`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `timeline_lanes_transition_slot_unique` ON `timeline_lanes` (`transition_id`,`slot_index`);--> statement-breakpoint
INSERT INTO `timeline_lanes` (`transition_id`, `slot_index`, `route_id`, `offset_x`, `offset_y`) SELECT `id`, 0, `route_id`, json_extract(`path_params`, '$.offset[0]'), json_extract(`path_params`, '$.offset[1]') FROM `timeline_transitions` WHERE `path_style` = 'route' AND `route_id` IS NOT NULL ORDER BY `id`;--> statement-breakpoint
UPDATE `timeline_transitions` SET `path_style` = 'direct', `path_params` = NULL, `route_id` = NULL WHERE `path_style` = 'route';--> statement-breakpoint
DELETE FROM `history_undo` WHERE EXISTS (SELECT 1 FROM `timeline_lanes`);--> statement-breakpoint
DELETE FROM `history_redo` WHERE EXISTS (SELECT 1 FROM `timeline_lanes`);