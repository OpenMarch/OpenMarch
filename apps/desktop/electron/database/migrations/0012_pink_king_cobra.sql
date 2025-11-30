CREATE VIEW `timing_objects` AS 
    SELECT
        beats.position AS position,
        beats.duration AS duration,
        SUM(duration) OVER (
            ORDER BY position
            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ) AS timestamp,
        beats.id AS beat_id,
        pages.id AS page_id,
        measures.id AS measure_id
    FROM beats
    LEFT JOIN pages
        ON beats.id = pages.start_beat
    LEFT JOIN measures
        ON beats.id = measures.start_beat
    ORDER BY beats.position ASC;