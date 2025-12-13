CREATE VIEW `timing_objects` AS
SELECT beats.position AS position,
    beats.duration AS duration,
    SUM(duration) OVER (
        ORDER BY position ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
    ) AS timestamp,
    beats.id AS beat_id,
    pages.id AS page_id,
    measures.id AS measure_id
FROM beats
    LEFT JOIN pages ON beats.id = pages.start_beat
    LEFT JOIN measures ON beats.id = measures.start_beat;
--> statement-breakpoint
-- Ensure beats have sequential positions
WITH new_positions AS (
    SELECT rowid AS rid,
           ROW_NUMBER() OVER (
               ORDER BY position
           ) AS new_position
    FROM beats
    WHERE id != 0
)
UPDATE beats
SET position = (
        SELECT new_position
        FROM new_positions np
        WHERE np.rid = beats.rowid
    )
WHERE id != 0;
--> statement-breakpoint
-- Ensure pages start from beat ID 0 and 1
-- If there's no page at beat position 1, shift all pages back
WITH page_1_info AS (
    -- Find where page 1 currently is (if it exists)
    SELECT
        MIN(b.position) as page_1_position
    FROM pages p
    JOIN beats b ON b.id = p.start_beat
    WHERE p.id = 1
),
needs_fix AS (
    -- Check if we need to fix: page 1 exists but is not at position 1
    SELECT
        CASE
            WHEN EXISTS (SELECT 1 FROM pages WHERE id = 1)
            AND EXISTS (SELECT 1 FROM beats WHERE position = 1)
            AND (SELECT page_1_position FROM page_1_info) != 1
            AND (SELECT page_1_position FROM page_1_info) IS NOT NULL
            THEN 1
            ELSE 0
        END as should_fix,
        COALESCE((SELECT page_1_position FROM page_1_info) - 1, 0) as offset
)
UPDATE pages
SET start_beat = CASE
    -- Page 1: move to beat at position 1
    WHEN pages.id = 1
    AND (SELECT should_fix FROM needs_fix) = 1 THEN (
        SELECT b.id
        FROM beats b
        WHERE b.position = 1
        LIMIT 1
    )
    -- All other pages (id > 1): shift back by the offset
    WHEN pages.id > 1
    AND (SELECT should_fix FROM needs_fix) = 1 THEN (
        SELECT b2.id
        FROM beats b1
        JOIN beats b2 ON b2.position = b1.position - (SELECT offset FROM needs_fix)
        WHERE b1.id = pages.start_beat
        LIMIT 1
    )
    ELSE pages.start_beat
END
WHERE pages.id != 0
AND (SELECT should_fix FROM needs_fix) = 1;
