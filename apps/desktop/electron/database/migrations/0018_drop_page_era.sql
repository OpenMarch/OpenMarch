-- The page-era motion tables (ADR 0001 §1). The first timeline-only migration
-- (FIRST_TIMELINE_MIGRATION_TAG): a page-era file (version 7) runs it inside its conversion,
-- after the converter has read these tables. IF EXISTS: a page-era file converted and then reset
-- to version 7 by an older release has already lost them.
DROP TABLE IF EXISTS `marcher_pages`;--> statement-breakpoint
DROP TABLE IF EXISTS `midsets`;--> statement-breakpoint
DROP TABLE IF EXISTS `pathways`;--> statement-breakpoint
DROP TABLE IF EXISTS `shape_page_marchers`;--> statement-breakpoint
DROP TABLE IF EXISTS `shape_pages`;--> statement-breakpoint
DROP TABLE IF EXISTS `shapes`;