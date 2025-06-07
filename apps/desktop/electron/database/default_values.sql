-- Default values collected from database versions v1-v6
-- Prioritizing newer versions for overrides.
-- These represent the state if a database is created at v6 or migrated through all versions.

-- Beats Table (beats)
-- Default starting beat (ID 0)
INSERT INTO "beats" ("id", "duration", "position", "include_in_measure", "notes", "created_at", "updated_at") VALUES (0, 0, 0, 1, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
-- Note: Additional beats are generated based on the default measures.
-- For the default ABC (8 measures of 4/4 at 120bpm), 32 beats (ID 1-32) would be created.
-- Example for one such beat (actual duration depends on tempo and time signature processing):
-- INSERT INTO "beats" (id, duration, position, include_in_measure, created_at, updated_at) VALUES (1, 0.5, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Pages Table (pages)
-- Default starting page (ID 0) linked to starting beat (ID 0)
INSERT INTO "pages" ("id", "is_subset", "notes", "created_at", "updated_at", "start_beat") VALUES (0, 0, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0);

-- FieldProperties Table (field_properties)
-- Default FieldProperties if created fresh at v6 (uses v5's createFieldPropertiesTable method).
-- The json_data is from FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES.
-- If migrating from older versions, v3 and v4 would have modified this json_data.
INSERT INTO "field_properties" (id, json_data, image, field_theme) VALUES (1, '{"name":"High School Football Field (No End Zones)","stepSizeInches":22.5,"xCheckpoints":[{"coordinate":-26.666666666666668,"lineType":"SOLID","id":0,"visible":true},{"coordinate":-20,"lineType":"SOLID","id":1,"visible":true},{"coordinate":-13.333333333333334,"lineType":"SOLID","id":2,"visible":true},{"coordinate":-6.666666666666667,"lineType":"SOLID","id":3,"visible":true},{"coordinate":0,"lineType":"SOLID","id":4,"visible":true},{"coordinate":6.666666666666667,"lineType":"SOLID","id":5,"visible":true},{"coordinate":13.333333333333334,"lineType":"SOLID","id":6,"visible":true},{"coordinate":20,"lineType":"SOLID","id":7,"visible":true},{"coordinate":26.666666666666668,"lineType":"SOLID","id":8,"visible":true}],"yCheckpoints":[{"coordinate":-13.333333333333334,"lineType":"SOLID","id":0,"visible":true},{"coordinate":-8.88888888888889,"lineType":"DASHED","id":1,"visible":true},{"coordinate":0,"lineType":"SOLID","id":2,"visible":true},{"coordinate":8.88888888888889,"lineType":"DASHED","id":3,"visible":true},{"coordinate":13.333333333333334,"lineType":"SOLID","id":4,"visible":true}],"yardNumberCoordinates":[{"x":-20,"y":-15.333333333333334,"label":"40"},{"x":-13.333333333333334,"y":-15.333333333333334,"label":"45"},{"x":-6.666666666666667,"y":-15.333333333333334,"label":"50"},{"x":0,"y":-15.333333333333334,"label":"G"},{"x":6.666666666666667,"y":-15.333333333333334,"label":"50"},{"x":13.333333333333334,"y":-15.333333333333334,"label":"45"},{"x":20,"y":-15.333333333333334,"label":"40"},{"x":-20,"y":15.333333333333334,"label":"40"},{"x":-13.333333333333334,"y":15.333333333333334,"label":"45"},{"x":-6.666666666666667,"y":15.333333333333334,"label":"50"},{"x":0,"y":15.333333333333334,"label":"G"},{"x":6.666666666666667,"y":15.333333333333334,"label":"50"},{"x":13.333333333333334,"y":15.333333333333334,"label":"45"},{"x":20,"y":15.333333333333334,"label":"40"}],"useHashes":true,"halfLineXInterval":4,"halfLineYInterval":4,"isCustom":false,"pixelsPerStep":12}', NULL, NULL);

-- Measures Table (measures)
-- If created new or no prior data, defaults are based on Measure.defaultMeasures ABC string:
-- 'X:1\nQ:1/4=120\nM:4/4\nV:1 baritone\nV:1\nz4 | z4 | z4 | z4 | z4 | z4 | z4 | z4 |\n'
-- This ABC data is processed to populate the 'beats' table first, then 'measures' table links to these beats.
-- Example for the first measure (assuming beat IDs 1-4 correspond to the first 'z4'):
-- INSERT INTO "measures" (id, start_beat, rehearsal_mark, notes, created_at, updated_at) VALUES (1, 1, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
-- (This would be repeated for 7 more measures, linking to subsequent groups of 4 beats each)

-- SectionAppearances Table (section_appearances)
-- No explicit default INSERTs. Defaults are applied by the table schema for new rows.
-- For any new row:
--   fill_color: 'rgba(0, 0, 0, 1)'
--   outline_color: 'rgba(0, 0, 0, 1)'
--   shape_type: 'circle'
-- Example of how a row would get defaults:
-- INSERT INTO "section_appearances" (section, created_at, updated_at) VALUES ('DefaultSection', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
-- This would result in: section='DefaultSection', fill_color='rgba(0,0,0,1)', outline_color='rgba(0,0,0,1)', shape_type='circle'

-- Utility Table (utility)
INSERT INTO "utility" (id, last_page_counts) VALUES (0, 8);
