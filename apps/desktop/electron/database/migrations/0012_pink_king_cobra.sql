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
-- Ensure rows are sequential
WITH new_positions AS (
    SELECT rowid AS rid,
        ROW_NUMBER() OVER (
            ORDER BY position
        ) - 1 AS new_position
    FROM beats
)
UPDATE beats
SET position = (
        SELECT new_position
        FROM new_positions np
        WHERE np.rid = beats.rowid
    );
--> statement-breakpoint
WITH offset_result AS (
    WITH conditions AS (
        SELECT -- Check if there's a beat at position 1 (the second beat, since position starts at 0)
            CASE
                WHEN EXISTS (
                    SELECT 1
                    FROM timing_objects
                    WHERE position = 1
                ) THEN 1
                ELSE 0
            END as has_second_beat,
            -- Count total unique pages
            COUNT(DISTINCT page_id) FILTER (
                WHERE page_id IS NOT NULL
            ) as page_count,
            -- Check if beat at position 1 already has a page assigned
            CASE
                WHEN EXISTS (
                    SELECT 1
                    FROM timing_objects
                    WHERE position = 1
                        AND page_id IS NOT NULL
                ) THEN 1
                ELSE 0
            END as second_beat_has_page,
            -- Find position of page 2's start beat
            MIN(t.position) FILTER (
                WHERE t.page_id = 2
            ) as page_2_position
        FROM timing_objects t
    )
    SELECT has_second_beat,
        page_count,
        second_beat_has_page,
        page_2_position,
        -- Calculate the offset: current position of page 2 minus target position (1)
        CASE
            WHEN has_second_beat = 1
            AND page_count > 1
            AND second_beat_has_page = 0
            AND page_2_position IS NOT NULL THEN page_2_position - 1
            ELSE 0
        END as calculated_offset
    FROM conditions
)
UPDATE pages
SET start_beat = (
        SELECT b2.id
        FROM beats as b1
            JOIN beats AS b2 ON b2.position = b1.position - (
                SELECT calculated_offset
                FROM offset_result
            )
        WHERE b1.id = pages.start_beat
    )
WHERE pages.id != 0
