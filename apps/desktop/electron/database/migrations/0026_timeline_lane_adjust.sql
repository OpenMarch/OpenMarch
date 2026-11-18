-- Adjust, pathways step 3b (ADR 0017 §2, spec v0.10 J.1 and J.2): a lane's own displacement profile
-- as JSON. Hand-written over drizzle-kit's output, which rebuilt the table and copied a column that
-- isn't there yet (`SELECT "adjust" FROM timeline_lanes`): SQLite adds a nullable column with a CHECK
-- in place, so no lane is rewritten and no other table is touched (ADR 0017, Consequences). The
-- change-log and history triggers name their columns and are rebuilt on open from this build's
-- definitions (`createAllTriggers`, `createTriggers`). The app writes file version 12 with a file's
-- first Adjust (`fileVersion.ts`). Like 0024 and 0025 it also runs, unrecorded, on a page-era file
-- before its conversion (`CONVERTER_SCHEMA_MIGRATION_TAGS`), so it runs twice there: the migration
-- runners skip an ADD COLUMN whose column exists (`addColumnGuard.ts`).
ALTER TABLE `timeline_lanes` ADD COLUMN `adjust` text CONSTRAINT "timeline_lanes_adjust_check" CHECK(adjust IS NULL OR json_valid(adjust));
