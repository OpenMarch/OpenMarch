"""Storage tests QA-DB-01..24 and QA-DB-26..31 for the OpenMarch timeline spec v0.2 (§12.2). Run: python3 db_tests.py"""
import sqlite3, pathlib
from history import range_edit   # R-E1 is an app procedure (§6.1), not a trigger

SCHEMA = pathlib.Path(__file__).with_name("schema.sql").read_text()

def fresh():
    db = sqlite3.connect(":memory:", isolation_level=None)
    db.executescript(SCHEMA)
    db.executescript("""
      INSERT INTO marchers VALUES (1,'M1',0,0),(2,'M2',2,0);
      INSERT INTO shapes VALUES (1,'pt','line','{"points":[[16,0],[17,0]]}'),
                                (2,'blk','block','{"origin":[0,0],"rows":2,"cols":2,"spacing":[2,2]}');
      INSERT INTO timelines VALUES (1,'tl',0,32);
      INSERT INTO transitions(id,timeline_id,dest_shape_id,slot_count,start_beat,end_beat) VALUES (1,1,1,2,0,16);
      INSERT INTO assignments(marcher_id,transition_id,slot_index,start_beat,end_beat) VALUES (1,1,0,0,16);
    """)
    return db

results = []
def case(tid, desc, sql, expect_fail, check=None):
    db = fresh()
    try:
        body = sql.strip().rstrip(";") + ";"
        db.executescript("BEGIN;" + body + "COMMIT;")
        ok = not expect_fail
        msg = "accepted"
        if check: ok = ok and check(db); msg += " + postcondition " + ("ok" if check(db) else "FAILED")
    except sqlite3.DatabaseError as e:
        db.execute("ROLLBACK") if db.in_transaction else None
        ok = expect_fail; msg = f"rejected: {e}"
    results.append((tid, "PASS" if ok else "FAIL", desc, msg))

case("DB-01","assignment past transition end", "INSERT INTO assignments(marcher_id,transition_id,slot_index,start_beat,end_beat) VALUES (2,1,1,0,20)", True)
case("DB-02","slot_index >= slot_count", "INSERT INTO assignments(marcher_id,transition_id,slot_index,start_beat,end_beat) VALUES (2,1,2,0,16)", True)
case("DB-03","duplicate slot in transition", "INSERT INTO assignments(marcher_id,transition_id,slot_index,start_beat,end_beat) VALUES (2,1,0,0,16)", True)
case("DB-04","same marcher twice in one transition", "INSERT INTO assignments(marcher_id,transition_id,slot_index,start_beat,end_beat) VALUES (1,1,1,0,8)", True)
case("DB-05","overlap same marcher same layer (other transition)",
     "INSERT INTO transitions(id,timeline_id,dest_shape_id,slot_count,start_beat,end_beat) VALUES (2,1,1,1,8,24); INSERT INTO assignments(marcher_id,transition_id,slot_index,start_beat,end_beat,layer) VALUES (1,2,0,8,24,0);", True)
case("DB-06","overlap same marcher higher layer (a steal) is allowed",
     "INSERT INTO transitions(id,timeline_id,dest_shape_id,slot_count,start_beat,end_beat) VALUES (2,1,1,1,8,16); INSERT INTO assignments(marcher_id,transition_id,slot_index,start_beat,end_beat,layer) VALUES (1,2,0,8,16,1);", False)
case("DB-07","abutting ranges same layer allowed (half-open)",
     "INSERT INTO transitions(id,timeline_id,dest_shape_id,slot_count,start_beat,end_beat) VALUES (2,1,1,1,16,24); INSERT INTO assignments(marcher_id,transition_id,slot_index,start_beat,end_beat,layer) VALUES (1,2,0,16,24,0);", False)
case("DB-08","transition outside timeline", "INSERT INTO transitions(id,timeline_id,dest_shape_id,slot_count,start_beat,end_beat) VALUES (3,1,1,1,30,40)", True)
case("DB-09","shrink timeline below a transition", "UPDATE timelines SET end_beat = 10 WHERE id = 1", True)
case("DB-10","shrink slot_count below occupied slot",
     "INSERT INTO assignments(marcher_id,transition_id,slot_index,start_beat,end_beat) VALUES (2,1,1,0,16); UPDATE transitions SET slot_count = 1 WHERE id = 1;", True)
def range_case(tid, desc, setup, target, expect_fail, check=None):
    """Setup statements, then the R-E1 app procedure, in one transaction."""
    db = fresh()
    try:
        db.execute("BEGIN")
        for st in [s for s in setup.split(';') if s.strip()]: db.execute(st)
        for q, a in range_edit(db, *target): db.execute(q, a)
        db.execute("COMMIT")
        ok = not expect_fail; msg = "accepted"
        if check: ok = ok and check(db); msg += " + postcondition " + ("ok" if check(db) else "FAILED")
    except sqlite3.DatabaseError as e:
        db.execute("ROLLBACK") if db.in_transaction else None
        ok = expect_fail; msg = f"rejected: {e}"
    results.append((tid, "PASS" if ok else "FAIL", desc, msg))

range_case("DB-11","stretch transition (R-E1 procedure): anchored assignment follows", "", (1, 0, 24), False,
     check=lambda db: db.execute("SELECT start_beat,end_beat FROM assignments WHERE marcher_id=1").fetchone() == (0,24))
range_case("DB-12","shrink transition: unanchored assignment stranded -> abort",
     "INSERT INTO assignments(marcher_id,transition_id,slot_index,start_beat,end_beat) VALUES (2,1,1,4,12)", (1, 0, 10), True)
range_case("DB-13","move transition start past an anchored row's end -> abort (empty row)",
     "INSERT INTO transitions(id,timeline_id,dest_shape_id,slot_count,start_beat,end_beat) VALUES (2,1,1,1,0,16); INSERT INTO assignments(marcher_id,transition_id,slot_index,start_beat,end_beat,layer) VALUES (2,2,0,0,4,0)", (2, 6, 16), True)
case("DB-13b","raw range update that strands an assignment -> abort (tr_range_check)", "UPDATE transitions SET end_beat = 10 WHERE id = 1", True)
case("DB-14","FTL into a block shape", "INSERT INTO transitions(id,timeline_id,dest_shape_id,path_style,slot_count,start_beat,end_beat) VALUES (3,1,2,'follow_the_leader',4,0,8)", True)
case("DB-15","block over capacity", "INSERT INTO transitions(id,timeline_id,dest_shape_id,slot_count,start_beat,end_beat) VALUES (3,1,2,5,0,8)", True)
case("DB-16","block at capacity ok", "INSERT INTO transitions(id,timeline_id,dest_shape_id,slot_count,start_beat,end_beat) VALUES (3,1,2,4,0,8)", False)
case("DB-17","delete shape in use", "DELETE FROM shapes WHERE id = 1", True)
case("DB-18","delete transition cascades assignments", "DELETE FROM transitions WHERE id = 1", False,
     check=lambda db: db.execute("SELECT count(*) FROM assignments").fetchone()[0] == 0)
case("DB-19","invalid path_style", "UPDATE transitions SET path_style = 'spiral' WHERE id = 1", True)
case("DB-20","invalid geometry JSON", "INSERT INTO shapes VALUES (9,'x','line','not json')", True)
case("DB-21","reshape block below a user's slot_count",
     "INSERT INTO transitions(id,timeline_id,dest_shape_id,slot_count,start_beat,end_beat) VALUES (3,1,2,4,0,8); UPDATE shapes SET geometry = '{\"origin\":[0,0],\"rows\":1,\"cols\":2,\"spacing\":[2,2]}' WHERE id = 2;", True)
case("DB-22","zero-length assignment", "INSERT INTO assignments(marcher_id,transition_id,slot_index,start_beat,end_beat) VALUES (2,1,1,8,8)", True)
case("DB-23","update assignment into overlap",
     "INSERT INTO transitions(id,timeline_id,dest_shape_id,slot_count,start_beat,end_beat) VALUES (2,1,1,1,16,32); INSERT INTO assignments(marcher_id,transition_id,slot_index,start_beat,end_beat,layer) VALUES (1,2,0,16,32,0); UPDATE assignments SET start_beat = 12 WHERE transition_id = 2;", True)



range_case("DB-24","stretch transition into same-layer neighbour -> abort",
     "INSERT INTO transitions(id,timeline_id,dest_shape_id,slot_count,start_beat,end_beat) VALUES (2,1,1,1,16,24); INSERT INTO assignments(marcher_id,transition_id,slot_index,start_beat,end_beat) VALUES (1,2,0,16,24)", (1, 0, 20), True)

def edit(db, statements):
    """§6 write wrapper: one DB transaction per edit; any error rolls back everything; batch only on commit."""
    db.execute("BEGIN")
    try:
        for st in statements: db.execute(st) if isinstance(st, str) else db.execute(*st)
        bad = db.execute("SELECT code, transition_id, detail FROM commit_violations").fetchall()
        if bad: raise sqlite3.IntegrityError(f"{bad[0][0]}: {bad[0][2]}")   # commit-time invariant (§6)
        batch = db.execute("SELECT tbl,row_id,before,after FROM change_log ORDER BY seq").fetchall()
        db.execute("DELETE FROM change_log")
        db.execute("COMMIT")
        return batch
    except sqlite3.DatabaseError:
        db.execute("ROLLBACK")
        raise

def check(tid, desc, fn):
    try: ok, msg = fn()
    except Exception as e: ok, msg = False, f"unexpected: {e}"
    results.append((tid, "PASS" if ok else "FAIL", desc, msg))

def db26():
    db = fresh(); db.execute("DELETE FROM change_log")
    try: edit(db, ["UPDATE marchers SET label='CHANGED' WHERE id=1",
                   "INSERT INTO assignments(marcher_id,transition_id,slot_index,start_beat,end_beat) VALUES (2,1,9,0,16)"])
    except sqlite3.DatabaseError: pass
    label = db.execute("SELECT label FROM marchers WHERE id=1").fetchone()[0]
    return label == 'M1', f"label after failed edit = {label!r} (wrapper rolled back the earlier statement)"
check("DB-26", "failed edit rolls back its earlier statements (write wrapper)", db26)

def db26b():
    db = fresh(); db.execute("BEGIN"); db.execute("UPDATE marchers SET label='CHANGED' WHERE id=1")
    try: db.execute("INSERT INTO assignments(marcher_id,transition_id,slot_index,start_beat,end_beat) VALUES (2,1,9,0,16)")
    except sqlite3.DatabaseError: pass
    db.execute("COMMIT")
    label = db.execute("SELECT label FROM marchers WHERE id=1").fetchone()[0]
    return label == 'CHANGED', f"without the wrapper the label persists ({label!r}): RAISE(ABORT) is statement-level, as the review said"
check("DB-26b", "documented hazard: committing after a caught error keeps earlier statements", db26b)

def rejects(stmts):
    db = fresh()
    try: edit(db, stmts); return False
    except sqlite3.DatabaseError as e: return str(e)
for tid, desc, st in [
  ("DB-27a", "fractional slot_index", "INSERT INTO assignments(marcher_id,transition_id,slot_index,start_beat,end_beat) VALUES (2,1,0.5,0,16)"),
  ("DB-27b", "fractional start_beat", "INSERT INTO assignments(marcher_id,transition_id,slot_index,start_beat,end_beat) VALUES (2,1,1,0.5,16)"),
  ("DB-27c", "fractional end_beat",   "INSERT INTO assignments(marcher_id,transition_id,slot_index,start_beat,end_beat) VALUES (2,1,1,0,15.5)"),
  ("DB-27d", "fractional layer",      "INSERT INTO assignments(marcher_id,transition_id,slot_index,start_beat,end_beat,layer) VALUES (2,1,1,0,16,0.5)"),
  ("DB-27e", "text in an integer column", "UPDATE transitions SET slot_count='many' WHERE id=1"),
  ("DB-28a", "negative beat",         "INSERT INTO timelines VALUES (2,'x',-4,8)"),
  ("DB-28b", "beat beyond 2^31-1",    "INSERT INTO timelines VALUES (2,'x',0,3000000000)"),
  ("DB-28c", "layer out of range",    "INSERT INTO assignments(marcher_id,transition_id,slot_index,start_beat,end_beat,layer) VALUES (2,1,1,0,16,5000)"),
  ("DB-28d", "infinite home coordinate", "UPDATE marchers SET home_x = 1e999 WHERE id=1"),
  ("DB-28e", "NaN home coordinate (stored as NULL)", "UPDATE marchers SET home_x = 0.0/0.0 WHERE id=1"),
]:
    check(tid, desc + " rejected", lambda st=st: (lambda r: (bool(r), f"rejected: {r}" if r else "ACCEPTED"))(rejects([st])))

def db29():
    db = fresh(); db.execute("DELETE FROM change_log")
    db.execute("INSERT INTO marchers VALUES (3,'M3',4,0)")
    db.execute("INSERT INTO assignments(marcher_id,transition_id,slot_index,start_beat,end_beat) VALUES (3,1,1,4,12)")
    db.execute("DELETE FROM change_log")
    b1 = edit(db, range_edit(db, 1, 0, 20))                  # R-E1 procedure: explicit, logged row updates
    rewritten = [r for r in b1 if r[0] == 'assignments']
    b2 = edit(db, ["DELETE FROM transitions WHERE id=1"])
    cascaded = [r for r in b2 if r[0] == 'assignments' and r[3] is None]
    ok = len(rewritten) == 1 and '"end":16' in rewritten[0][2] and '"end":20' in rewritten[0][3] and len(cascaded) == 2
    return ok, f"range edit logged {len(rewritten)} anchored rewrite(s) with before/after; delete logged {len(cascaded)} cascaded assignment deletes"
check("DB-29", "change log captures the range procedure's row updates and FK cascades, with row images", db29)

def db30():
    db = fresh(); db.execute("DELETE FROM change_log")
    try: edit(db, ["UPDATE marchers SET label='X' WHERE id=1", "INSERT INTO assignments(marcher_id,transition_id,slot_index,start_beat,end_beat) VALUES (2,1,9,0,16)"])
    except sqlite3.DatabaseError: pass
    n = db.execute("SELECT count(*) FROM change_log").fetchone()[0]
    return n == 0, f"change_log rows after a rolled-back edit: {n}"
check("DB-30", "rolled-back edit leaves no change-log rows (no notification)", db30)

def db31():
    db = fresh()
    ok_inf = not db.execute("""SELECT json_valid('{"points":[[Infinity,0],[1,0]]}')""").fetchone()[0]
    big = db.execute("""SELECT json_valid('{"points":[[1e999,0],[1,0]]}')""").fetchone()[0]
    return ok_inf and big == 1, f"json_valid rejects Infinity; accepts 1e999 -> finiteness of geometry numbers must be checked in the app (I-S1)"
check("DB-31", "geometry finiteness is an app-level check", db31)

def db32():
    out = []
    for g, want in [('{"center":[0,0],"radius":10000,"start_angle":0,"clockwise":false}', True),
                    ('{"center":[0,0],"radius":0,"start_angle":0,"clockwise":false}', False),
                    ('{"center":[0,0],"radius":2e6,"start_angle":0,"clockwise":false}', False),
                    ('{"center":[0,0],"radius":"5","start_angle":0,"clockwise":false}', False),
                    ('{"center":[0,0],"start_angle":0,"clockwise":false}', False)]:
        db = fresh()
        try: edit(db, [f"INSERT INTO shapes VALUES (9,'c','circle','{g}')"]); got = True
        except sqlite3.DatabaseError: got = False
        out.append(got == want)
    return all(out), f"accepted only the valid radius (results {out})"
check("DB-32", "circle radius must be numeric, > 0 and <= 1e6 (I-S1)", db32)

def db33():
    out = []
    for style, params, want in [('arc', '{"bulge":0.5}', True), ('arc', '{"bulge":-0.5}', True), ('arc', '{"bulge":0.6}', False),
                                ('arc', '{"bulge":2}', False), ('arc', '{"bulge":1e999}', False), ('arc', '{"bulge":"0.5"}', False),
                                ('arc', None, False), ('direct', None, True)]:
        db = fresh()
        try: edit(db, [("UPDATE transitions SET path_style='%s', path_params=%s WHERE id=1" % (style, 'NULL' if params is None else "'" + params + "'"))]); got = True
        except sqlite3.DatabaseError: got = False
        out.append(got == want)
    return all(out), f"bulge bound enforced (results {out})"
check("DB-33", "arc bulge must be numeric with |bulge| <= 0.5: minor arcs only (I-T2)", db33)

def db34():
    out = []
    for ang, want in [('0', True), ('6.28', True), ('6.3', False), ('-0.1', False), ('1e20', False), ('"1"', False), (None, False)]:
        g = '{"center":[0,0],"radius":1,' + ('' if ang is None else '"start_angle":' + ang + ',') + '"clockwise":false}'
        db = fresh()
        try: edit(db, [f"INSERT INTO shapes VALUES (9,'c','circle','{g}')"]); got = True
        except sqlite3.DatabaseError: got = False
        out.append(got == want)
    return all(out), f"only normalized numeric angles accepted (results {out})"
check("DB-34", "circle start_angle must be numeric in [0, 2π) (I-S1)", db34)

SHAPELESS = "INSERT INTO transitions(id,timeline_id,dest_shape_id,path_style,path_params,slot_count,start_beat,end_beat) VALUES (5,1,NULL,'direct',NULL,2,0,8)"
PTS = ["INSERT INTO slot_destinations VALUES (5,0,3.5,-2)", "INSERT INTO slot_destinations VALUES (5,1,7,4)"]
def outcome(stmts):
    db = fresh()
    try: edit(db, stmts); return db, None
    except sqlite3.DatabaseError as e: return db, str(e)

def db35():
    db, err = outcome([SHAPELESS] + PTS)
    return err is None, "accepted" if err is None else f"rejected: {err}"
check("DB-35", "shapeless direct transition with every slot placed, in one edit", db35)

def db36():
    db, err = outcome(["UPDATE marchers SET label='X' WHERE id=1", SHAPELESS, PTS[0]])
    rolled = db.execute("SELECT label FROM marchers WHERE id=1").fetchone()[0] == 'M1' and db.execute("SELECT count(*) FROM transitions WHERE id=5").fetchone()[0] == 0
    return bool(err) and 'E-T6' in err and rolled, f"rejected at commit ({err}); whole edit rolled back: {rolled}"
check("DB-36", "shapeless transition with an unplaced slot is rejected at commit", db36)

def db37():
    db, err = outcome(["INSERT INTO transitions(id,timeline_id,dest_shape_id,path_style,path_params,slot_count,start_beat,end_beat) VALUES (6,1,NULL,'follow_the_leader','{\"waypoints\":[]}',1,0,8)"])
    return bool(err), f"rejected: {err}"
check("DB-37", "follow-the-leader without a shape is rejected (I-T5)", db37)

def db38():
    r = {}
    _, r['row on shaped'] = outcome(["INSERT INTO slot_destinations VALUES (1,0,1,1)"])
    _, r['shape over rows'] = outcome([SHAPELESS] + PTS + ["UPDATE transitions SET dest_shape_id=1 WHERE id=5"])
    _, r['to shape'] = outcome([SHAPELESS] + PTS + ["DELETE FROM slot_destinations WHERE transition_id=5", "UPDATE transitions SET dest_shape_id=1 WHERE id=5"])
    _, r['to individual'] = outcome(["UPDATE transitions SET dest_shape_id=NULL WHERE id=1",
                                     "INSERT INTO slot_destinations VALUES (1,0,0,0)", "INSERT INTO slot_destinations VALUES (1,1,2,0)"])
    ok = bool(r['row on shaped']) and bool(r['shape over rows']) and r['to shape'] is None and r['to individual'] is None
    return ok, "; ".join(f"{k}: {'rejected' if v else 'accepted'}" for k, v in r.items())
check("DB-38", "a shape and individual destinations are exclusive; converting either way works in one edit", db38)

def db39():
    r = {}
    _, r['slot >= slot_count'] = outcome([SHAPELESS] + PTS + ["INSERT INTO slot_destinations VALUES (5,2,0,0)"])
    _, r['shrink below a placed slot'] = outcome([SHAPELESS] + PTS + ["UPDATE transitions SET slot_count=1 WHERE id=5"])
    _, r['grow without placing'] = outcome([SHAPELESS] + PTS + ["UPDATE transitions SET slot_count=3 WHERE id=5"])
    _, r['grow and place'] = outcome([SHAPELESS] + PTS + ["UPDATE transitions SET slot_count=3 WHERE id=5", "INSERT INTO slot_destinations VALUES (5,2,1,1)"])
    ok = all(r[k] for k in ['slot >= slot_count', 'shrink below a placed slot', 'grow without placing']) and r['grow and place'] is None
    return ok, "; ".join(f"{k}: {'rejected' if v else 'accepted'}" for k, v in r.items())
check("DB-39", "destination rows stay consistent with slot_count", db39)

def db40():
    res = [bool(outcome([SHAPELESS, "INSERT INTO slot_destinations VALUES (5,0,%s,0)" % v, PTS[1]])[1]) for v in ['2e6', '1e999', '0.0/0.0', "'abc'"]]
    return all(res), f"out-of-range, infinite, NaN and text coordinates rejected: {res}"
check("DB-40", "destination coordinates are finite numbers within the authored bound (I-D2)", db40)

def db41():
    db = fresh(); db.execute("DELETE FROM change_log")
    b1 = edit(db, [SHAPELESS] + PTS)
    b2 = edit(db, ["UPDATE slot_destinations SET x=0 WHERE transition_id=5 AND slot_index=1"])
    b3 = edit(db, ["DELETE FROM transitions WHERE id=5"])
    n_ins = sum(1 for r in b1 if r[0] == 'slot_destinations'); n_upd = sum(1 for r in b2 if r[0] == 'slot_destinations' and r[2] and r[3])
    n_del = sum(1 for r in b3 if r[0] == 'slot_destinations' and r[3] is None)
    return (n_ins, n_upd, n_del) == (2, 1, 2), f"logged {n_ins} inserts, {n_upd} update, {n_del} cascaded deletes (row_id = transition id)"
check("DB-41", "change log records destination edits, including cascades", db41)

for r in results: print(" | ".join(r))
n_pass = sum(r[1] == "PASS" for r in results)
print(f"{n_pass} of {len(results)} pass")
import sys
sys.exit(0 if n_pass == len(results) else 1)
