PRAGMA foreign_keys = ON;

CREATE TABLE marchers (
  id      INTEGER PRIMARY KEY,
  label   TEXT NOT NULL,
  home_x  REAL NOT NULL CHECK (abs(home_x) <= 1e6),
  home_y  REAL NOT NULL CHECK (abs(home_y) <= 1e6)
) STRICT;

CREATE TABLE shapes (
  id        INTEGER PRIMARY KEY,
  name      TEXT,
  kind      TEXT NOT NULL CHECK (kind IN ('line','freehand','circle','box','block')),
  geometry  TEXT NOT NULL CHECK (json_valid(geometry)),
  -- I-S1 (partial, DB-enforced): circle radius positive and within the coordinate bound;
  -- start_angle normalized to [0, 2π) so that adding a turn never loses precision
  CHECK (kind <> 'circle' OR (coalesce(json_type(geometry, '$.radius'), '') IN ('integer', 'real')
                              AND json_extract(geometry, '$.radius') > 0
                              AND json_extract(geometry, '$.radius') <= 1e6
                              AND coalesce(json_type(geometry, '$.start_angle'), '') IN ('integer', 'real')
                              AND json_extract(geometry, '$.start_angle') >= 0
                              AND json_extract(geometry, '$.start_angle') < 6.283185307179586))
) STRICT;

CREATE TABLE timelines (
  id          INTEGER PRIMARY KEY,
  name        TEXT,
  start_beat  INTEGER NOT NULL CHECK (start_beat BETWEEN 0 AND 2147483647),
  end_beat    INTEGER NOT NULL CHECK (end_beat   BETWEEN 0 AND 2147483647),
  CHECK (end_beat > start_beat)
) STRICT;

-- v0.9 (D-19, Appendix I): a drawn path. No owner column, like shapes; a slot walks it through a lane (v0.10, D-20).
CREATE TABLE routes (
  id        INTEGER PRIMARY KEY,
  geometry  TEXT NOT NULL CHECK (json_valid(geometry))    -- §5.2, I-R1
) STRICT;

CREATE TABLE transitions (
  id             INTEGER PRIMARY KEY,
  timeline_id    INTEGER NOT NULL REFERENCES timelines(id) ON DELETE CASCADE,
  dest_shape_id  INTEGER          REFERENCES shapes(id)    ON DELETE RESTRICT,   -- NULL: slots placed individually (D-16)
  path_style     TEXT NOT NULL DEFAULT 'direct'
                 CHECK (path_style IN ('direct','arc','follow_the_leader')),         -- v0.10: 'route' retired (I-R2′)
  path_params    TEXT CHECK (path_params IS NULL OR json_valid(path_params)),
  route_id       INTEGER          REFERENCES routes(id)    ON DELETE RESTRICT,   -- v0.10: a follow-the-leader trail only (I-R2′)
  order_mode     TEXT NOT NULL DEFAULT 'inherit' CHECK (order_mode IN ('inherit','slot')),
  slot_count     INTEGER NOT NULL CHECK (slot_count BETWEEN 1 AND 10000),
  start_beat     INTEGER NOT NULL CHECK (start_beat BETWEEN 0 AND 2147483647),
  end_beat       INTEGER NOT NULL CHECK (end_beat   BETWEEN 0 AND 2147483647),
  CHECK (end_beat > start_beat),
  -- I-T5′ (plan step 4): follow-the-leader follows a path, so it needs a destination shape or a trail route
  CHECK (dest_shape_id IS NOT NULL OR route_id IS NOT NULL OR path_style <> 'follow_the_leader'),
  -- I-T2 (partial, DB-enforced): an arc carries a numeric bulge with |bulge| <= 0.5 (minor arcs only, §8.11)
  CHECK (path_style <> 'arc' OR (coalesce(json_type(path_params, '$.bulge'), '') IN ('integer', 'real')
                                 AND abs(json_extract(path_params, '$.bulge')) <= 0.5))
) STRICT;

CREATE TABLE assignments (
  id             INTEGER PRIMARY KEY,
  marcher_id     INTEGER NOT NULL REFERENCES marchers(id)    ON DELETE CASCADE,
  transition_id  INTEGER NOT NULL REFERENCES transitions(id) ON DELETE CASCADE,
  slot_index     INTEGER NOT NULL CHECK (slot_index >= 0),
  start_beat     INTEGER NOT NULL CHECK (start_beat BETWEEN 0 AND 2147483647),
  end_beat       INTEGER NOT NULL CHECK (end_beat   BETWEEN 0 AND 2147483647),
  layer          INTEGER NOT NULL DEFAULT 0 CHECK (layer BETWEEN -1000 AND 1000),
  CHECK (end_beat > start_beat),
  UNIQUE (transition_id, slot_index),
  UNIQUE (transition_id, marcher_id)
) STRICT;

-- D-16: individually placed destinations, used when a transition has no shape (one row per slot)
CREATE TABLE slot_destinations (
  transition_id  INTEGER NOT NULL REFERENCES transitions(id) ON DELETE CASCADE,
  slot_index     INTEGER NOT NULL CHECK (slot_index >= 0),
  x              REAL NOT NULL CHECK (abs(x) <= 1e6),       -- I-D2: inside the authored bound
  y              REAL NOT NULL CHECK (abs(y) <= 1e6),
  PRIMARY KEY (transition_id, slot_index)
) STRICT;

CREATE INDEX idx_asn_marcher    ON assignments(marcher_id, start_beat);
CREATE INDEX idx_tr_shape       ON transitions(dest_shape_id);
CREATE INDEX idx_tr_timeline    ON transitions(timeline_id);
-- (transition_id, ...) lookups are served by the UNIQUE(transition_id, slot_index) index.

-- I-A1, I-A2: assignment inside its transition's range and slot_count
CREATE TRIGGER asn_bounds_ins BEFORE INSERT ON assignments
WHEN NOT EXISTS (SELECT 1 FROM transitions t WHERE t.id = NEW.transition_id
                 AND NEW.start_beat >= t.start_beat AND NEW.end_beat <= t.end_beat
                 AND NEW.slot_index < t.slot_count)
BEGIN SELECT RAISE(ABORT, 'E-A1/E-A2: assignment outside transition range or slot_count'); END;

CREATE TRIGGER asn_bounds_upd BEFORE UPDATE ON assignments
WHEN NOT EXISTS (SELECT 1 FROM transitions t WHERE t.id = NEW.transition_id
                 AND NEW.start_beat >= t.start_beat AND NEW.end_beat <= t.end_beat
                 AND NEW.slot_index < t.slot_count)
BEGIN SELECT RAISE(ABORT, 'E-A1/E-A2: assignment outside transition range or slot_count'); END;

-- I-A3: one marcher, one layer, no overlapping ranges
CREATE TRIGGER asn_overlap_ins BEFORE INSERT ON assignments
WHEN EXISTS (SELECT 1 FROM assignments a WHERE a.marcher_id = NEW.marcher_id AND a.layer = NEW.layer
             AND a.start_beat < NEW.end_beat AND NEW.start_beat < a.end_beat)
BEGIN SELECT RAISE(ABORT, 'E-A3: overlapping assignments for one marcher at the same layer'); END;

CREATE TRIGGER asn_overlap_upd BEFORE UPDATE ON assignments
WHEN EXISTS (SELECT 1 FROM assignments a WHERE a.id <> NEW.id AND a.marcher_id = NEW.marcher_id
             AND a.layer = NEW.layer AND a.start_beat < NEW.end_beat AND NEW.start_beat < a.end_beat)
BEGIN SELECT RAISE(ABORT, 'E-A3: overlapping assignments for one marcher at the same layer'); END;

-- I-T1: transition inside its timeline
CREATE TRIGGER tr_in_timeline_ins BEFORE INSERT ON transitions
WHEN NOT EXISTS (SELECT 1 FROM timelines l WHERE l.id = NEW.timeline_id
                 AND NEW.start_beat >= l.start_beat AND NEW.end_beat <= l.end_beat)
BEGIN SELECT RAISE(ABORT, 'E-T1: transition outside its timeline'); END;

CREATE TRIGGER tr_in_timeline_upd BEFORE UPDATE OF start_beat, end_beat, timeline_id ON transitions
WHEN NOT EXISTS (SELECT 1 FROM timelines l WHERE l.id = NEW.timeline_id
                 AND NEW.start_beat >= l.start_beat AND NEW.end_beat <= l.end_beat)
BEGIN SELECT RAISE(ABORT, 'E-T1: transition outside its timeline'); END;

CREATE TRIGGER tl_contains_upd BEFORE UPDATE OF start_beat, end_beat ON timelines
WHEN EXISTS (SELECT 1 FROM transitions t WHERE t.timeline_id = NEW.id
             AND (t.start_beat < NEW.start_beat OR t.end_beat > NEW.end_beat))
BEGIN SELECT RAISE(ABORT, 'E-T1: timeline would no longer contain its transitions'); END;

-- I-A2 (transition side): slot_count cannot shrink below an occupied slot
CREATE TRIGGER tr_slots_upd BEFORE UPDATE OF slot_count ON transitions
WHEN EXISTS (SELECT 1 FROM assignments a WHERE a.transition_id = NEW.id AND a.slot_index >= NEW.slot_count)
BEGIN SELECT RAISE(ABORT, 'E-A2: slot_count below an occupied slot'); END;

-- I-T6 (row side): a destination row belongs to a shapeless transition and to one of its slots
CREATE TRIGGER sd_ins BEFORE INSERT ON slot_destinations
WHEN NOT EXISTS (SELECT 1 FROM transitions t WHERE t.id = NEW.transition_id
                 AND t.dest_shape_id IS NULL AND NEW.slot_index < t.slot_count)
BEGIN SELECT RAISE(ABORT, 'E-T6: destination row on a shaped transition or outside slot_count'); END;

CREATE TRIGGER sd_upd BEFORE UPDATE ON slot_destinations
WHEN NOT EXISTS (SELECT 1 FROM transitions t WHERE t.id = NEW.transition_id
                 AND t.dest_shape_id IS NULL AND NEW.slot_index < t.slot_count)
BEGIN SELECT RAISE(ABORT, 'E-T6: destination row on a shaped transition or outside slot_count'); END;

-- I-T6 (transition side): a shape and individual destinations are exclusive; slot_count keeps its rows valid
CREATE TRIGGER tr_shape_set BEFORE UPDATE OF dest_shape_id ON transitions
WHEN NEW.dest_shape_id IS NOT NULL AND EXISTS (SELECT 1 FROM slot_destinations d WHERE d.transition_id = NEW.id)
BEGIN SELECT RAISE(ABORT, 'E-T6: remove individual destinations before assigning a shape'); END;

CREATE TRIGGER tr_slots_dest_upd BEFORE UPDATE OF slot_count ON transitions
WHEN EXISTS (SELECT 1 FROM slot_destinations d WHERE d.transition_id = NEW.id AND d.slot_index >= NEW.slot_count)
BEGIN SELECT RAISE(ABORT, 'E-T6: slot_count below a placed destination'); END;

-- §6 commit-time invariants: the write wrapper aborts the edit if this view returns any row.
-- (Completeness can only be judged once the whole edit has run: a transition and its points are inserted together.)
CREATE VIEW commit_violations AS
  SELECT 'E-T6' AS code, t.id AS transition_id,
         'shapeless transition has ' || (SELECT count(*) FROM slot_destinations d WHERE d.transition_id = t.id)
           || ' of ' || t.slot_count || ' destinations' AS detail
    FROM transitions t
   WHERE t.dest_shape_id IS NULL
     AND (SELECT count(*) FROM slot_destinations d WHERE d.transition_id = t.id) <> t.slot_count
  UNION ALL
  -- I-R3′ (v0.10): every route is walked through a lane whose slot holds a row, or is a follow-the-leader trail
  SELECT 'E-R3', NULL, 'route ' || r.id || ' is walked by nobody'
    FROM routes r
   WHERE NOT EXISTS (SELECT 1 FROM lanes l JOIN assignments a ON a.transition_id = l.transition_id AND a.slot_index = l.slot_index
                      WHERE l.route_id = r.id)
     AND NOT EXISTS (SELECT 1 FROM transitions t WHERE t.route_id = r.id AND t.path_style = 'follow_the_leader')
  UNION ALL
  -- I-R2′ (v0.10): only a follow-the-leader transition carries a route (its trail)
  SELECT 'E-R2', t.id, 'a ' || t.path_style || ' transition has a route' FROM transitions t
   WHERE t.path_style <> 'follow_the_leader' AND t.route_id IS NOT NULL
  UNION ALL
  -- I-LN4 (v0.10): an own lane (no offset) on a non-FTL transition is the only lane of its route
  SELECT 'E-R4', l.transition_id, 'route ' || l.route_id || ' is shared but the lane on slot ' || l.slot_index || ' has no offset'
    FROM lanes l JOIN transitions t ON t.id = l.transition_id
   WHERE l.offset_x IS NULL AND t.path_style <> 'follow_the_leader'
     AND (SELECT count(*) FROM lanes u WHERE u.route_id = l.route_id) > 1
  UNION ALL
  -- I-LN5 (v0.10): every lane of a route is on a transition of one timeline (one range by C-11)
  SELECT 'E-R5', l.transition_id, 'route ' || l.route_id || ' has lanes in two moves'
    FROM lanes l JOIN transitions t ON t.id = l.transition_id
    JOIN lanes u ON u.route_id = l.route_id AND u.id < l.id JOIN transitions v ON v.id = u.transition_id
   WHERE t.timeline_id <> v.timeline_id
  UNION ALL
  -- I-LN2 (v0.10): a lane on a follow-the-leader transition is its trail lane
  SELECT 'E-LN2', l.transition_id, 'the lane on slot ' || l.slot_index || ' of a follow-the-leader move is not its trail'
    FROM lanes l JOIN transitions t ON t.id = l.transition_id
   WHERE t.path_style = 'follow_the_leader' AND (l.offset_x IS NOT NULL OR t.route_id IS NULL OR l.route_id <> t.route_id)
  UNION ALL
  -- I-LN4 (v0.10, plan step 3b): an own lane carries no Adjust
  SELECT 'E-R4', l.transition_id, 'the own lane on slot ' || l.slot_index || ' has an Adjust'
    FROM lanes l JOIN transitions t ON t.id = l.transition_id
   WHERE l.offset_x IS NULL AND l.adjust IS NOT NULL AND t.path_style <> 'follow_the_leader'
  UNION ALL
  -- I-J3 (J.3, plan step 3b): an anchor names a point id of its route
  SELECT 'E-J3', l.transition_id, 'an Adjust on slot ' || l.slot_index || ' names a missing point'
    FROM lanes l, json_each(l.adjust, '$.keys') k, routes r
   WHERE r.id = l.route_id
     AND ( (json_extract(k.value,'$.a') <> 'from' AND NOT EXISTS (SELECT 1 FROM json_each(r.geometry,'$.points') p
             WHERE json_extract(p.value,'$.id') = json_extract(k.value,'$.a')))
        OR (json_extract(k.value,'$.b') <> 'to'   AND NOT EXISTS (SELECT 1 FROM json_each(r.geometry,'$.points') p
             WHERE json_extract(p.value,'$.id') = json_extract(k.value,'$.b'))) )
  UNION ALL
  -- I-J5 (J.3, plan step 3b): two keys of a profile on one straight stretch closer than s_min (126.5625 = s_min²), or equal
  SELECT 'E-J5', l.transition_id, 'two Adjust keys on slot ' || l.slot_index || ' are closer than a step'
    FROM lanes l, json_each(l.adjust, '$.keys') k1, json_each(l.adjust, '$.keys') k2
   WHERE k2.key > k1.key
     AND json_extract(k2.value,'$.a') = json_extract(k1.value,'$.a')
     AND json_extract(k2.value,'$.b') = json_extract(k1.value,'$.b')
     AND ( json_extract(k1.value,'$.f') = json_extract(k2.value,'$.f')
        OR EXISTS (SELECT 1 FROM routes r, json_each(r.geometry,'$.points') pa, json_each(r.geometry,'$.points') pb
                    WHERE r.id = l.route_id AND pb.key = pa.key + 1
                      AND json_extract(pa.value,'$.id') = json_extract(k1.value,'$.a')
                      AND json_extract(pb.value,'$.id') = json_extract(k1.value,'$.b')
                      AND json_type(pa.value,'$.tension') IS NULL AND json_type(pb.value,'$.tension') IS NULL
                      AND json_type(pb.value,'$.bulge') IS NULL            -- R-14″ (step 10a): an arc leg is not straight
                      AND (json_extract(k1.value,'$.f') - json_extract(k2.value,'$.f')) * (json_extract(k1.value,'$.f') - json_extract(k2.value,'$.f'))
                          * ( (json_extract(pb.value,'$.at[0]') - json_extract(pa.value,'$.at[0]')) * (json_extract(pb.value,'$.at[0]') - json_extract(pa.value,'$.at[0]'))
                            + (json_extract(pb.value,'$.at[1]') - json_extract(pa.value,'$.at[1]')) * (json_extract(pb.value,'$.at[1]') - json_extract(pa.value,'$.at[1]')) ) < 126.5625) );

CREATE INDEX idx_tr_route ON transitions(route_id);

-- v0.10 (D-20, J.1, plan step 24): a slot walks a route. `group_adjust_id` comes with a later step (ADD COLUMN).
CREATE TABLE lanes (
  id             INTEGER PRIMARY KEY,
  transition_id  INTEGER NOT NULL REFERENCES transitions(id) ON DELETE RESTRICT,
  slot_index     INTEGER NOT NULL CHECK (slot_index >= 0),
  route_id       INTEGER NOT NULL REFERENCES routes(id)      ON DELETE RESTRICT,
  offset_x       REAL CHECK (offset_x IS NULL OR offset_x BETWEEN -2000000 AND 2000000),
  offset_y       REAL CHECK (offset_y IS NULL OR offset_y BETWEEN -2000000 AND 2000000),
  adjust         TEXT CHECK (adjust IS NULL OR json_valid(adjust)),                    -- this spot's own Adjust (J.2, plan step 3b)
  UNIQUE (transition_id, slot_index),                                  -- I-LN3
  CHECK ((offset_x IS NULL) = (offset_y IS NULL))
) STRICT;
CREATE INDEX idx_lane_route ON lanes(route_id);

-- I-LN1: a lane's slot is one of its transition's, checked from both sides (U-3)
CREATE TRIGGER lane_slot_ins BEFORE INSERT ON lanes
WHEN NOT EXISTS (SELECT 1 FROM transitions t WHERE t.id = NEW.transition_id AND NEW.slot_index < t.slot_count)
BEGIN SELECT RAISE(ABORT, 'E-LN1: lane outside its transition''s slots'); END;
CREATE TRIGGER lane_slot_upd BEFORE UPDATE ON lanes
WHEN NOT EXISTS (SELECT 1 FROM transitions t WHERE t.id = NEW.transition_id AND NEW.slot_index < t.slot_count)
BEGIN SELECT RAISE(ABORT, 'E-LN1: lane outside its transition''s slots'); END;
CREATE TRIGGER tr_slots_lane_upd BEFORE UPDATE OF slot_count ON transitions
WHEN EXISTS (SELECT 1 FROM lanes l WHERE l.transition_id = NEW.id AND l.slot_index >= NEW.slot_count)
BEGIN SELECT RAISE(ABORT, 'E-LN1: slot_count below a lane'); END;

-- I-A1 (transition side): a transition's range must still contain every one of its assignments.
-- A pure check. The anchored rewrite (R-E1) is an app procedure, NOT a trigger: a trigger that modifies rows
-- adds side effects that undo replays in the wrong order (§6.1, QA-UNDO-1).
CREATE TRIGGER tr_range_check BEFORE UPDATE OF start_beat, end_beat ON transitions
WHEN EXISTS (SELECT 1 FROM assignments a WHERE a.transition_id = NEW.id
             AND (a.start_beat < NEW.start_beat OR a.end_beat > NEW.end_beat))
BEGIN SELECT RAISE(ABORT, 'E-A1: range change strands an assignment'); END;

-- I-T3, I-T4: destination shape must suit the path style and slot_count
CREATE TRIGGER tr_dest_ins BEFORE INSERT ON transitions
WHEN EXISTS (SELECT 1 FROM shapes s WHERE s.id = NEW.dest_shape_id AND s.kind = 'block'
             AND (NEW.path_style = 'follow_the_leader'
                  OR json_extract(s.geometry,'$.rows') * json_extract(s.geometry,'$.cols') < NEW.slot_count))
BEGIN SELECT RAISE(ABORT, 'E-T3/E-T4: block shape used for FTL or over capacity'); END;

CREATE TRIGGER tr_dest_upd BEFORE UPDATE OF dest_shape_id, path_style, slot_count ON transitions
WHEN EXISTS (SELECT 1 FROM shapes s WHERE s.id = NEW.dest_shape_id AND s.kind = 'block'
             AND (NEW.path_style = 'follow_the_leader'
                  OR json_extract(s.geometry,'$.rows') * json_extract(s.geometry,'$.cols') < NEW.slot_count))
BEGIN SELECT RAISE(ABORT, 'E-T3/E-T4: block shape used for FTL or over capacity'); END;

CREATE TRIGGER shape_dest_upd BEFORE UPDATE OF kind, geometry ON shapes
WHEN NEW.kind = 'block' AND EXISTS (SELECT 1 FROM transitions t WHERE t.dest_shape_id = NEW.id
             AND (t.path_style = 'follow_the_leader'
                  OR json_extract(NEW.geometry,'$.rows') * json_extract(NEW.geometry,'$.cols') < t.slot_count))
BEGIN SELECT RAISE(ABORT, 'E-T3/E-T4: shape change invalidates a transition using it'); END;

-- §10.2 change log: one row per changed row, in commit order, including FK cascades (they fire
-- AFTER triggers). The write wrapper reads and clears it inside the same transaction, commits,
-- then hands the coalesced batch to the resolver. Undo and redo go through the same wrapper (§6.1).
-- Triggers on data tables either RAISE or write to bookkeeping tables (change_log, history_*); none
-- modifies a data table (§6.1 U-1).
CREATE TABLE change_log (
  seq     INTEGER PRIMARY KEY,
  tbl     TEXT NOT NULL,
  row_id  INTEGER NOT NULL,
  before  TEXT,            -- JSON row image, NULL on insert
  after   TEXT             -- JSON row image, NULL on delete
) STRICT;

CREATE TRIGGER log_marchers_ins AFTER INSERT ON marchers BEGIN INSERT INTO change_log(tbl,row_id,before,after) VALUES ('marchers',NEW.id,NULL,json_object('id',NEW.id,'home',json_array(NEW.home_x,NEW.home_y))); END;
CREATE TRIGGER log_marchers_upd AFTER UPDATE ON marchers BEGIN INSERT INTO change_log(tbl,row_id,before,after) VALUES ('marchers',NEW.id,json_object('id',OLD.id,'home',json_array(OLD.home_x,OLD.home_y)),json_object('id',NEW.id,'home',json_array(NEW.home_x,NEW.home_y))); END;
CREATE TRIGGER log_marchers_del AFTER DELETE ON marchers BEGIN INSERT INTO change_log(tbl,row_id,before,after) VALUES ('marchers',OLD.id,json_object('id',OLD.id,'home',json_array(OLD.home_x,OLD.home_y)),NULL); END;
CREATE TRIGGER log_shapes_ins AFTER INSERT ON shapes BEGIN INSERT INTO change_log(tbl,row_id,before,after) VALUES ('shapes',NEW.id,NULL,json_object('id',NEW.id,'kind',NEW.kind,'geometry',json(NEW.geometry))); END;
CREATE TRIGGER log_shapes_upd AFTER UPDATE ON shapes BEGIN INSERT INTO change_log(tbl,row_id,before,after) VALUES ('shapes',NEW.id,json_object('id',OLD.id,'kind',OLD.kind,'geometry',json(OLD.geometry)),json_object('id',NEW.id,'kind',NEW.kind,'geometry',json(NEW.geometry))); END;
CREATE TRIGGER log_shapes_del AFTER DELETE ON shapes BEGIN INSERT INTO change_log(tbl,row_id,before,after) VALUES ('shapes',OLD.id,json_object('id',OLD.id,'kind',OLD.kind,'geometry',json(OLD.geometry)),NULL); END;
CREATE TRIGGER log_transitions_ins AFTER INSERT ON transitions BEGIN INSERT INTO change_log(tbl,row_id,before,after) VALUES ('transitions',NEW.id,NULL,json_object('id',NEW.id,'dest',NEW.dest_shape_id,'style',NEW.path_style,'params',json(NEW.path_params),'order',NEW.order_mode,'slots',NEW.slot_count,'start',NEW.start_beat,'end',NEW.end_beat,'route',NEW.route_id)); END;
CREATE TRIGGER log_transitions_upd AFTER UPDATE ON transitions BEGIN INSERT INTO change_log(tbl,row_id,before,after) VALUES ('transitions',NEW.id,json_object('id',OLD.id,'dest',OLD.dest_shape_id,'style',OLD.path_style,'params',json(OLD.path_params),'order',OLD.order_mode,'slots',OLD.slot_count,'start',OLD.start_beat,'end',OLD.end_beat,'route',OLD.route_id),json_object('id',NEW.id,'dest',NEW.dest_shape_id,'style',NEW.path_style,'params',json(NEW.path_params),'order',NEW.order_mode,'slots',NEW.slot_count,'start',NEW.start_beat,'end',NEW.end_beat,'route',NEW.route_id)); END;
CREATE TRIGGER log_transitions_del AFTER DELETE ON transitions BEGIN INSERT INTO change_log(tbl,row_id,before,after) VALUES ('transitions',OLD.id,json_object('id',OLD.id,'dest',OLD.dest_shape_id,'style',OLD.path_style,'params',json(OLD.path_params),'order',OLD.order_mode,'slots',OLD.slot_count,'start',OLD.start_beat,'end',OLD.end_beat,'route',OLD.route_id),NULL); END;
CREATE TRIGGER log_assignments_ins AFTER INSERT ON assignments BEGIN INSERT INTO change_log(tbl,row_id,before,after) VALUES ('assignments',NEW.id,NULL,json_object('id',NEW.id,'marcher',NEW.marcher_id,'transition',NEW.transition_id,'slot',NEW.slot_index,'start',NEW.start_beat,'end',NEW.end_beat,'layer',NEW.layer)); END;
CREATE TRIGGER log_assignments_upd AFTER UPDATE ON assignments BEGIN INSERT INTO change_log(tbl,row_id,before,after) VALUES ('assignments',NEW.id,json_object('id',OLD.id,'marcher',OLD.marcher_id,'transition',OLD.transition_id,'slot',OLD.slot_index,'start',OLD.start_beat,'end',OLD.end_beat,'layer',OLD.layer),json_object('id',NEW.id,'marcher',NEW.marcher_id,'transition',NEW.transition_id,'slot',NEW.slot_index,'start',NEW.start_beat,'end',NEW.end_beat,'layer',NEW.layer)); END;
CREATE TRIGGER log_assignments_del AFTER DELETE ON assignments BEGIN INSERT INTO change_log(tbl,row_id,before,after) VALUES ('assignments',OLD.id,json_object('id',OLD.id,'marcher',OLD.marcher_id,'transition',OLD.transition_id,'slot',OLD.slot_index,'start',OLD.start_beat,'end',OLD.end_beat,'layer',OLD.layer),NULL); END;
-- slot_destinations rows are logged under their transition id (the resolver recomputes that transition's destinations)
CREATE TRIGGER log_slot_destinations_ins AFTER INSERT ON slot_destinations BEGIN INSERT INTO change_log(tbl,row_id,before,after) VALUES ('slot_destinations',NEW.transition_id,NULL,json_object('transition',NEW.transition_id,'slot',NEW.slot_index,'x',NEW.x,'y',NEW.y)); END;
CREATE TRIGGER log_slot_destinations_upd AFTER UPDATE ON slot_destinations BEGIN INSERT INTO change_log(tbl,row_id,before,after) VALUES ('slot_destinations',NEW.transition_id,json_object('transition',OLD.transition_id,'slot',OLD.slot_index,'x',OLD.x,'y',OLD.y),json_object('transition',NEW.transition_id,'slot',NEW.slot_index,'x',NEW.x,'y',NEW.y)); END;
CREATE TRIGGER log_routes_ins AFTER INSERT ON routes BEGIN INSERT INTO change_log(tbl,row_id,before,after) VALUES ('routes',NEW.id,NULL,json_object('id',NEW.id,'geometry',json(NEW.geometry))); END;
CREATE TRIGGER log_routes_upd AFTER UPDATE ON routes BEGIN INSERT INTO change_log(tbl,row_id,before,after) VALUES ('routes',NEW.id,json_object('id',OLD.id,'geometry',json(OLD.geometry)),json_object('id',NEW.id,'geometry',json(NEW.geometry))); END;
CREATE TRIGGER log_routes_del AFTER DELETE ON routes BEGIN INSERT INTO change_log(tbl,row_id,before,after) VALUES ('routes',OLD.id,json_object('id',OLD.id,'geometry',json(OLD.geometry)),NULL); END;
CREATE TRIGGER log_lanes_ins AFTER INSERT ON lanes BEGIN INSERT INTO change_log(tbl,row_id,before,after) VALUES ('lanes',NEW.id,NULL,json_object('id',NEW.id,'transition',NEW.transition_id,'slot',NEW.slot_index,'route',NEW.route_id,'offset',CASE WHEN NEW.offset_x IS NULL THEN NULL ELSE json_array(NEW.offset_x,NEW.offset_y) END,'adjust',json(NEW.adjust))); END;
CREATE TRIGGER log_lanes_upd AFTER UPDATE ON lanes BEGIN INSERT INTO change_log(tbl,row_id,before,after) VALUES ('lanes',NEW.id,json_object('id',OLD.id,'transition',OLD.transition_id,'slot',OLD.slot_index,'route',OLD.route_id,'offset',CASE WHEN OLD.offset_x IS NULL THEN NULL ELSE json_array(OLD.offset_x,OLD.offset_y) END,'adjust',json(OLD.adjust)),json_object('id',NEW.id,'transition',NEW.transition_id,'slot',NEW.slot_index,'route',NEW.route_id,'offset',CASE WHEN NEW.offset_x IS NULL THEN NULL ELSE json_array(NEW.offset_x,NEW.offset_y) END,'adjust',json(NEW.adjust))); END;
CREATE TRIGGER log_lanes_del AFTER DELETE ON lanes BEGIN INSERT INTO change_log(tbl,row_id,before,after) VALUES ('lanes',OLD.id,json_object('id',OLD.id,'transition',OLD.transition_id,'slot',OLD.slot_index,'route',OLD.route_id,'offset',CASE WHEN OLD.offset_x IS NULL THEN NULL ELSE json_array(OLD.offset_x,OLD.offset_y) END,'adjust',json(OLD.adjust)),NULL); END;
CREATE TRIGGER log_slot_destinations_del AFTER DELETE ON slot_destinations BEGIN INSERT INTO change_log(tbl,row_id,before,after) VALUES ('slot_destinations',OLD.transition_id,json_object('transition',OLD.transition_id,'slot',OLD.slot_index,'x',OLD.x,'y',OLD.y),NULL); END;
