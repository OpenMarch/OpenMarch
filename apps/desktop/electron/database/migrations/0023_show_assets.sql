CREATE TABLE `show_asset_blobs` (
	`hash` text PRIMARY KEY NOT NULL,
	`data` blob NOT NULL,
	CONSTRAINT "show_asset_blobs_hash_check" CHECK(length(hash) = 64 AND hash NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "show_asset_blobs_data_check" CHECK(typeof(data) = 'blob')
);
--> statement-breakpoint
CREATE TABLE `show_assets` (
	`id` text NOT NULL,
	`version_hash` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`parts` text NOT NULL,
	`sidecar` text DEFAULT '{}' NOT NULL,
	`credits` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	PRIMARY KEY(`id`, `version_hash`),
	CONSTRAINT "show_assets_id_check" CHECK(length(id) > 0),
	CONSTRAINT "show_assets_version_hash_check" CHECK(length(version_hash) = 64 AND version_hash NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "show_assets_parts_check" CHECK(json_valid(parts) AND json_type(parts) = 'object'),
	CONSTRAINT "show_assets_sidecar_check" CHECK(json_valid(sidecar) AND json_type(sidecar) = 'object'),
	CONSTRAINT "show_assets_credits_check" CHECK(json_valid(credits) AND json_type(credits) = 'object')
);
--> statement-breakpoint
CREATE INDEX `show_assets_version_hash_idx` ON `show_assets` (`version_hash`);