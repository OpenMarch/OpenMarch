CREATE TABLE `view3d_cameras` (
	`id` integer PRIMARY KEY NOT NULL,
	`json_data` text NOT NULL,
	CONSTRAINT "view3d_cameras_id_check" CHECK(id = 1)
);
