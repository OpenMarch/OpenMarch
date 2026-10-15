CREATE TABLE `cue_marchers` (
	`id` integer PRIMARY KEY NOT NULL,
	`cue_id` integer NOT NULL,
	`marcher_id` integer NOT NULL,
	FOREIGN KEY (`cue_id`) REFERENCES `cues`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`marcher_id`) REFERENCES `marchers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `cue_marchers_marcher_id_idx` ON `cue_marchers` (`marcher_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `cue_marchers_cue_marcher_unique` ON `cue_marchers` (`cue_id`,`marcher_id`);--> statement-breakpoint
CREATE TABLE `cues` (
	`id` integer PRIMARY KEY NOT NULL,
	`channel` text NOT NULL,
	`kind` text NOT NULL,
	`target_kind` text NOT NULL,
	`target_section` text,
	`target_tag_id` integer,
	`beat_id` integer NOT NULL,
	`value` text NOT NULL,
	`phrase_asset_id` integer,
	`length` integer,
	`transition_length` integer,
	`settings_json` text DEFAULT '{}' NOT NULL,
	`ripple_json` text,
	`notes` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`target_tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`beat_id`) REFERENCES `beats`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`phrase_asset_id`) REFERENCES `phrase_assets`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "cues_channel_check" CHECK(channel IN ('feet', 'horn_equipment', 'facing', 'body', 'carry', 'silk', 'uniform')),
	CONSTRAINT "cues_kind_check" CHECK(kind IN ('state', 'phrase')),
	CONSTRAINT "cues_target_check" CHECK((target_kind IN ('band', 'set') AND target_section IS NULL AND target_tag_id IS NULL) OR (target_kind = 'section' AND target_section IS NOT NULL AND target_tag_id IS NULL) OR (target_kind = 'tag' AND target_tag_id IS NOT NULL AND target_section IS NULL)),
	CONSTRAINT "cues_length_check" CHECK((kind = 'phrase' AND typeof(length) = 'integer' AND length >= 2 AND transition_length IS NULL) OR (kind = 'state' AND length IS NULL AND (transition_length IS NULL OR (typeof(transition_length) = 'integer' AND transition_length >= 1)))),
	CONSTRAINT "cues_value_check" CHECK((value GLOB 'builtin:?*' AND phrase_asset_id IS NULL) OR (kind = 'phrase' AND phrase_asset_id IS NOT NULL AND value = 'show:' || phrase_asset_id) OR (channel IN ('carry', 'silk', 'uniform') AND kind = 'state' AND value GLOB 'library:?*@?*' AND phrase_asset_id IS NULL) OR (channel = 'carry' AND kind = 'state' AND value = 'none' AND phrase_asset_id IS NULL)),
	CONSTRAINT "cues_settings_json_check" CHECK(json_valid(settings_json) AND json_type(settings_json) = 'object'),
	CONSTRAINT "cues_ripple_json_check" CHECK(ripple_json IS NULL OR (channel <> 'feet' AND json_valid(ripple_json) AND json_type(ripple_json) = 'object' AND json_extract(ripple_json, '$.version') = 1 AND json_type(ripple_json, '$.span') = 'integer' AND json_extract(ripple_json, '$.span') >= 1 AND json_extract(ripple_json, '$.order') IN ('drill', 'left_right', 'right_left', 'down_form')))
);
--> statement-breakpoint
CREATE INDEX `cues_beat_id_idx` ON `cues` (`beat_id`);--> statement-breakpoint
CREATE INDEX `cues_channel_beat_id_idx` ON `cues` (`channel`,`beat_id`);--> statement-breakpoint
CREATE TABLE `page_performer_settings` (
	`page_id` integer PRIMARY KEY NOT NULL,
	`dot_mode` text NOT NULL,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "page_performer_settings_dot_mode_check" CHECK(dot_mode IN ('foot', 'body'))
);
--> statement-breakpoint
CREATE TABLE `phrase_assets` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`label` text NOT NULL,
	`source` text NOT NULL,
	`channels_json` text NOT NULL,
	`format_version` integer NOT NULL,
	`data_json` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	CONSTRAINT "phrase_assets_source_check" CHECK(source IN ('copied_builtin', 'posed', 'imported')),
	CONSTRAINT "phrase_assets_channels_json_check" CHECK(json_valid(channels_json) AND json_type(channels_json) = 'array'),
	CONSTRAINT "phrase_assets_format_version_check" CHECK(typeof(format_version) = 'integer' AND format_version >= 1),
	CONSTRAINT "phrase_assets_data_json_check" CHECK(json_valid(data_json) AND json_type(data_json) = 'object')
);
