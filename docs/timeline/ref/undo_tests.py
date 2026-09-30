"""Undo/redo tests QA-UNDO-1..7 (spec §6.1), on the app's history tables. Run: python3 undo_tests.py"""
import sqlite3, pathlib, sys
import history as H

SCHEMA = pathlib.Path(__file__).with_name("schema.sql").read_text()
V06_ANCHOR = """CREATE TRIGGER tr_range_anchor AFTER UPDATE OF start_beat, end_beat ON transitions
BEGIN
  UPDATE assignments
     SET start_beat = CASE WHEN start_beat = OLD.start_beat THEN NEW.start_beat ELSE start_beat END,
         end_beat   = CASE WHEN end_beat   = OLD.end_beat   THEN NEW.end_beat   ELSE end_beat   END
   WHERE transition_id = NEW.id
     AND (start_beat = OLD.start_beat OR end_beat = OLD.end_beat);
  SELECT RAISE(ABORT, 'E-A1: range change strands an unanchored assignment')
   WHERE EXISTS (SELECT 1 FROM assignments a WHERE a.transition_id = NEW.id
                 AND (a.start_beat < NEW.start_beat OR a.end_beat > NEW.end_beat));
END;"""

def fresh(extra=""):
    db = sqlite3.connect(":memory:", isolation_level=None)
    db.executescript(SCHEMA)
    if extra:                                     # negative control: put the v0.6 trigger back
        db.executescript("DROP TRIGGER tr_range_check;" + extra)
    H.install(db)
    db.execute("PRAGMA foreign_keys = ON")
    H.edit(db, ["INSERT INTO marchers VALUES (1,'M1',0,0),(2,'M2',2,0),(3,'M3',4,0)",
                "INSERT INTO shapes VALUES (1,'line','line','{\"points\":[[16,0],[20,0]]}')",
                "INSERT INTO timelines VALUES (1,'tl',0,64)",
                "INSERT INTO transitions(id,timeline_id,dest_shape_id,slot_count,start_beat,end_beat) VALUES (1,1,1,3,8,24)",
                "INSERT INTO assignments(id,marcher_id,transition_id,slot_index,start_beat,end_beat) VALUES (1,1,1,0,8,24),(2,2,1,1,8,24),(3,3,1,2,12,20)"])
    db.execute("DELETE FROM history_undo")        # the fixture itself is not undoable
    return db

results = []
def check(tid, desc, fn):
    try: ok, msg = fn()
    except Exception as e: ok, msg = False, f"unexpected: {type(e).__name__}: {e}"
    results.append((tid, "PASS" if ok else "FAIL", desc, msg))

def roundtrip(db, statements_fn):
    """edit -> undo -> redo -> undo; the state must match exactly at every step."""
    s0 = H.dump(db); H.edit(db, statements_fn(db)); s1 = H.dump(db)
    H.undo(db); a = H.dump(db) == s0
    H.redo(db); b = H.dump(db) == s1
    H.undo(db); c = H.dump(db) == s0
    return a and b and c and s0 != s1, f"undo exact: {a}; redo exact: {b}; undo again exact: {c}"

# QA-UNDO-1 (informational negative control): the v0.6 anchoring trigger makes a shrink impossible to undo
def u1():
    db = fresh(V06_ANCHOR); s0 = H.dump(db)
    H.edit(db, ["UPDATE transitions SET end_beat = 20 WHERE id = 1"])
    try: H.undo(db); return False, "undo succeeded (unexpected)"
    except sqlite3.DatabaseError as e:
        return H.dump(db) != s0, f"with the v0.6 trigger, undo of a shrink is rejected ({e}); the data stays at the edited state"
check("UNDO-1", "negative control: the v0.6 range trigger breaks undo (reproduces the review)", u1)

# QA-UNDO-1b (informational negative control for U-3): with the transition-side check removed, an edit can pass
# through an invalid state ("shrink, then fix the rows"); it commits, but its undo steps back onto that state and is rejected
def u1b():
    db = fresh(); db.execute("DROP TRIGGER tr_range_check"); s0 = H.dump(db)
    H.edit(db, ["UPDATE transitions SET end_beat = 16 WHERE id = 1", "UPDATE assignments SET end_beat = 16 WHERE id IN (1, 2, 3)"])
    committed = H.dump(db) != s0
    try: H.undo(db); return False, "undo succeeded (unexpected)"
    except sqlite3.DatabaseError as e: return committed, f"edit committed: {committed}; undo rejected ({e})"
check("UNDO-1b", "negative control: one-sided enforcement (no tr_range_check) lets an edit commit whose undo is rejected", u1b)

# QA-UNDO-2: the R-E1 procedure is undoable in every direction
# (the fixture's row 3 [12,20) is unanchored, so every target below still contains it)
for tid, (s, e), what in [("UNDO-2a", (8, 20), "shrink end"), ("UNDO-2b", (8, 32), "grow end"), ("UNDO-2c", (4, 24), "grow start"),
                          ("UNDO-2d", (10, 24), "shrink start"), ("UNDO-2e", (12, 28), "shift right"), ("UNDO-2f", (0, 20), "shift left")]:
    check(tid, f"range edit ({what}, to [{s},{e})): edit, undo, redo, undo", lambda s=s, e=e: roundtrip(fresh(), lambda db: H.range_edit(db, 1, s, e)))

# QA-UNDO-2g: a range edit that strands an unanchored row is rejected whole and leaves no history
def u2g():
    db = fresh(); s0 = H.dump(db)
    try: H.edit(db, H.range_edit(db, 1, 8, 16)); return False, "stranding edit accepted (unexpected)"
    except sqlite3.IntegrityError as e: err = str(e)
    clean = H.dump(db) == s0 and db.execute("SELECT count(*) FROM history_undo").fetchone()[0] == 0
    return clean and "E-A1" in err, f"rejected with {err}; data and history unchanged: {clean}"
check("UNDO-2g", "a range edit that strands an unanchored row is rejected (E-A1) and adds no history", u2g)

# QA-UNDO-3: FK cascades are undoable because SQLite logs each child's inverse before its parent's (pinned here).
# Reverse replay then re-inserts every parent before its children. If a SQLite version ever changed this order,
# this test fails and the fallback is ON DELETE RESTRICT plus explicit child-first deletes in app code (§6.1).
FK_PARENTS = {'assignments': [('transitions', 3), ('marchers', 2)], 'slot_destinations': [('transitions', 1)]}  # VALUES position of the FK

def parents_after_children(db):
    """Each logged child re-insert must come before its parent's re-insert (so the parent is replayed first)."""
    log = []
    for (q,) in db.execute("SELECT sql FROM history_undo ORDER BY sequence"):
        tbl = q.split()[2].split('(')[0]; vals = q[q.index('VALUES(') + 7:]
        log.append((tbl, vals.split(',')))                    # child rows hold only numbers; parents need only rowid
    pos = {(t, int(v[0])): i for i, (t, v) in enumerate(log) if t in ('transitions', 'marchers', 'timelines')}
    for i, (t, v) in enumerate(log):
        for ptbl, k in FK_PARENTS.get(t, []):
            j = pos.get((ptbl, int(v[k])))
            if j is not None and j < i: return False
    trs = [i for i, (t, _) in enumerate(log) if t == 'transitions']
    tls = [i for i, (t, _) in enumerate(log) if t == 'timelines']
    return all(i < j for i in trs for j in tls)

def u3():
    msgs, ok = [], True
    extra = ["INSERT INTO transitions(id,timeline_id,dest_shape_id,slot_count,start_beat,end_beat) VALUES (2,1,NULL,2,30,40)",
             "INSERT INTO slot_destinations VALUES (2,0,1,1),(2,1,3,1)",
             "INSERT INTO assignments(id,marcher_id,transition_id,slot_index,start_beat,end_beat) VALUES (4,1,2,0,30,40)"]
    for label, stmt in [("delete transition", "DELETE FROM transitions WHERE id = 1"),
                        ("delete marcher", "DELETE FROM marchers WHERE id = 1"),
                        ("delete timeline (two-level cascade, 2 transitions)", "DELETE FROM timelines WHERE id = 1")]:
        db = fresh(); H.edit(db, extra); db.execute("DELETE FROM history_undo")
        r = roundtrip(db, lambda db, stmt=stmt: [stmt])
        H.edit(db, [stmt]); order_ok = parents_after_children(db)
        n = db.execute("SELECT count(*) FROM history_undo").fetchone()[0]
        ok = ok and r[0] and order_ok
        msgs.append(f"{label} ({n} rows logged): {r[1]}; children logged before parents: {order_ok}")
    return ok, " | ".join(msgs)
check("UNDO-3", "cascade deletes undo and redo exactly; child-before-parent log order is pinned", u3)

# QA-UNDO-4: shape <-> individual conversions and grow-and-place (multi-statement edits, commit-time check)
def u4():
    msgs, ok = [], True
    def to_individual(db):
        return ["UPDATE transitions SET dest_shape_id = NULL WHERE id = 1"] + [f"INSERT INTO slot_destinations VALUES (1,{k},{k*3},5)" for k in range(3)]
    db = fresh(); r1 = roundtrip(db, to_individual)
    H.edit(db, to_individual(db))
    r2 = roundtrip(db, lambda db: ["DELETE FROM slot_destinations WHERE transition_id = 1", "UPDATE transitions SET dest_shape_id = 1 WHERE id = 1"])
    r3 = roundtrip(db, lambda db: ["UPDATE transitions SET slot_count = 4 WHERE id = 1", "INSERT INTO slot_destinations VALUES (1,3,9,9)"])
    for label, r in [("shape -> individual", r1), ("individual -> shape", r2), ("grow and place", r3)]:
        ok = ok and r[0]; msgs.append(f"{label}: {r[1]}")
    return ok, " | ".join(msgs)
check("UNDO-4", "shape/individual conversions and grow-and-place undo and redo exactly", u4)

# QA-UNDO-5: a rejected edit leaves no history; the undo stack still undoes the previous edit
def u5():
    db = fresh(); s0 = H.dump(db)
    H.edit(db, H.range_edit(db, 1, 8, 32)); s1 = H.dump(db); n = db.execute("SELECT count(*) FROM history_undo").fetchone()[0]
    try: H.edit(db, ["UPDATE marchers SET label='X' WHERE id=1", "INSERT INTO assignments(marcher_id,transition_id,slot_index,start_beat,end_beat) VALUES (1,1,5,8,24)"]); bad = False
    except sqlite3.DatabaseError: bad = True
    same = H.dump(db) == s1 and db.execute("SELECT count(*) FROM history_undo").fetchone()[0] == n
    H.undo(db)
    return bad and same and H.dump(db) == s0, f"edit rejected: {bad}; history and data unchanged: {same}; next undo restores the previous edit: {H.dump(db) == s0}"
check("UNDO-5", "a rejected edit adds no history and does not disturb the stacks", u5)

# QA-UNDO-6: a new edit clears redo; undo past the beginning is a no-op
def u6():
    db = fresh(); H.edit(db, H.range_edit(db, 1, 8, 32)); H.undo(db)
    has_redo = db.execute("SELECT count(*) FROM history_redo").fetchone()[0] > 0
    H.edit(db, ["UPDATE marchers SET home_x = 1 WHERE id = 3"])
    cleared = db.execute("SELECT count(*) FROM history_redo").fetchone()[0] == 0
    H.undo(db); H.undo(db); extra = H.undo(db) is None
    return has_redo and cleared and extra, f"redo populated after undo: {has_redo}; cleared by a new edit: {cleared}; undo with an empty stack is a no-op: {extra}"
check("UNDO-6", "redo is cleared by a new edit; undo on an empty stack is a no-op", u6)

# QA-UNDO-7: undo and redo produce change-log batches the resolver can consume
def u7():
    db = fresh(); H.edit(db, H.range_edit(db, 1, 8, 32))
    b_undo = H.undo(db); b_redo = H.redo(db)
    t_u = {r[0] for r in b_undo}; t_r = {r[0] for r in b_redo}
    return {'transitions', 'assignments'} <= t_u and {'transitions', 'assignments'} <= t_r, f"undo batch tables: {sorted(t_u)}; redo batch tables: {sorted(t_r)}"
check("UNDO-7", "undo and redo emit change-log batches like any edit", u7)

# QA-UNDO-8: group_limit pruning drops whole groups from the old end; the remaining stack undoes exactly
def u8():
    db = fresh(); db.execute("UPDATE history_stats SET group_limit = 3 WHERE id = 1")
    states = [H.dump(db)]
    for k in range(5):
        H.edit(db, [f"UPDATE marchers SET home_x = {10 + k} WHERE id = 1", f"UPDATE marchers SET home_y = {k} WHERE id = 2"]); states.append(H.dump(db))
    groups = db.execute("SELECT count(DISTINCT history_group), min(cnt), max(cnt) FROM (SELECT history_group, count(*) cnt FROM history_undo GROUP BY history_group)").fetchone()
    exact = []
    for k in range(3): H.undo(db); exact.append(H.dump(db) == states[4 - k])
    stop = H.undo(db) is None and H.dump(db) == states[2]
    return groups == (3, 2, 2) and all(exact) and stop, f"groups kept (count, min rows, max rows): {groups}; 3 undos exact: {exact}; 4th undo is a no-op at edit 2: {stop}"
check("UNDO-8", "group_limit pruning keeps whole groups; the kept stack undoes exactly and then stops", u8)

for r in results: print(" | ".join(r))
n_pass = sum(r[1] == "PASS" for r in results)
print(f"{n_pass} of {len(results)} pass")
sys.exit(0 if n_pass == len(results) else 1)
