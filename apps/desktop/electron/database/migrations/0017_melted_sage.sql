CREATE TABLE `view3d_venue` (
	`id` integer PRIMARY KEY NOT NULL,
	`json_data` text NOT NULL,
	CONSTRAINT "view3d_venue_id_check" CHECK(id = 1)
);
