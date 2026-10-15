CREATE TABLE `library_blobs` (
	`hash` text PRIMARY KEY NOT NULL,
	`data` blob NOT NULL,
	CONSTRAINT "library_blobs_hash_check" CHECK(length(hash) = 64),
	CONSTRAINT "library_blobs_data_type_check" CHECK(typeof(data) = 'blob')
);
--> statement-breakpoint
CREATE TABLE `library_items` (
	`item_id` text NOT NULL,
	`version_hash` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`built_in` integer DEFAULT 0 NOT NULL,
	`parts` text NOT NULL,
	`pins` text DEFAULT '[]' NOT NULL,
	`metadata` text NOT NULL,
	`sidecar` text,
	`embedded_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	PRIMARY KEY(`item_id`, `version_hash`),
	CONSTRAINT "library_items_kind_check" CHECK(kind IN ('model', 'artwork', 'uniform')),
	CONSTRAINT "library_items_built_in_check" CHECK(built_in IN (0, 1)),
	CONSTRAINT "library_items_version_hash_check" CHECK(length(version_hash) = 64)
);
