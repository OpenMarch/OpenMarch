-- Route sources, pathways step 3c (spec v0.10 J.1, K6): where a route came from. Step 3c writes
-- `detached_from` (AP-R9 Detach), so Rejoin (AP-R10) knows which group path a copy came from; the
-- other kinds are for later steps. App data: the resolver never reads it, and it is outside the
-- change log (history triggers only, created on open). A new table only; nothing is rebuilt and no
-- row of another table is touched, so a file without a detached path is unchanged. Both route
-- columns cascade, so an older build that deletes a route leaves no link naming it; this build
-- deletes links itself before their routes (AP-H3). An older build plays and edits a file with a
-- link exactly as before (a copy is a one-lane group path to it), so there is no file version bump.
-- IF NOT EXISTS: a test that rolls a file back to before an earlier migration runs this one again.
CREATE TABLE IF NOT EXISTS `timeline_route_sources` (
	`id` integer PRIMARY KEY NOT NULL,
	`route_id` integer NOT NULL,
	`kind` text NOT NULL,
	`source_route_id` integer,
	`data` text,
	FOREIGN KEY (`route_id`) REFERENCES `timeline_routes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_route_id`) REFERENCES `timeline_routes`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "timeline_route_sources_route_id_type_check" CHECK(typeof(route_id) = 'integer'),
	CONSTRAINT "timeline_route_sources_source_route_id_type_check" CHECK(source_route_id IS NULL OR typeof(source_route_id) = 'integer'),
	CONSTRAINT "timeline_route_sources_kind_check" CHECK(kind IN ('detached_from', 'recipe', 'mirror_of', 'pasted_from', 'split_from', 'continues')),
	CONSTRAINT "timeline_route_sources_data_check" CHECK(data IS NULL OR json_valid(data))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `timeline_idx_route_sources_route` ON `timeline_route_sources` (`route_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `timeline_idx_route_sources_source` ON `timeline_route_sources` (`source_route_id`);