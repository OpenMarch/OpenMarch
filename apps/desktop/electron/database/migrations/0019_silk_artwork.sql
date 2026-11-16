CREATE TABLE `view3d_silk_artwork` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`data` blob NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
