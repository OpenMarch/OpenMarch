CREATE TABLE `workspace_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`json_data` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	CONSTRAINT "workspace_settings_id_check" CHECK(id = 1)
);
