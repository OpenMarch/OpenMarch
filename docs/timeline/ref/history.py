"""Reference undo/redo on the app's history tables (spec §6.1), plus the app procedures that must be undo-safe.

History model (matches the app): history_undo / history_redo hold inverse SQL per row change, grouped by
history_group; history_stats (id = 1) holds the current groups. AFTER triggers on every tracked table write the
inverse of each row change. Undo replays a group's statements in reverse sequence order; redo replays the
statements that undo generated, also in reverse sequence order.

Everything here runs through the §6 write wrapper: one transaction, commit-time checks, change-log batch.
"""
import sqlite3

TRACKED = ['marchers', 'shapes', 'timelines', 'transitions', 'assignments', 'slot_destinations']

HISTORY_DDL = """
CREATE TABLE history_undo (sequence INTEGER PRIMARY KEY, history_group INTEGER NOT NULL, sql TEXT NOT NULL);
CREATE TABLE history_redo (sequence INTEGER PRIMARY KEY, history_group INTEGER NOT NULL, sql TEXT NOT NULL);
CREATE TABLE history_stats (id INTEGER PRIMARY KEY CHECK (id = 1), cur_undo_group INTEGER NOT NULL,
                            cur_redo_group INTEGER NOT NULL, group_limit INTEGER NOT NULL);
INSERT INTO history_stats VALUES (1, 0, 0, 500);
"""


def history_triggers(db):
    """One AFTER INSERT/UPDATE/DELETE trigger per tracked table, each writing the inverse statement."""
    out = []
    grp = "(SELECT cur_undo_group FROM history_stats WHERE id = 1)"
    for t in TRACKED:
        cols = [r[1] for r in db.execute(f"PRAGMA table_info({t})")]
        ins = f"'DELETE FROM {t} WHERE rowid=' || NEW.rowid"
        upd = (f"'UPDATE {t} SET ' || " + " || ',' || ".join(f"'{c}=' || quote(OLD.{c})" for c in cols)
               + " || ' WHERE rowid=' || OLD.rowid")
        dele = (f"'INSERT INTO {t}(rowid,{','.join(cols)}) VALUES(' || OLD.rowid || ',' || "
                + " || ',' || ".join(f"quote(OLD.{c})" for c in cols) + " || ')'")
        for ev, body in [('INSERT', ins), ('UPDATE', upd), ('DELETE', dele)]:
            out.append(f"CREATE TRIGGER hist_{t}_{ev.lower()} AFTER {ev} ON {t} "
                       f"BEGIN INSERT INTO history_undo(history_group, sql) VALUES ({grp}, {body}); END;")
    return "\n".join(out)


def install(db):
    db.executescript(HISTORY_DDL)
    db.executescript(history_triggers(db))


# group_limit: keep only the newest group_limit groups. Dropping whole groups from the OLD end is always safe
# (undo only ever replays the newest group); dropping part of a group is not.
PRUNE = """DELETE FROM history_undo WHERE history_group NOT IN (
             SELECT history_group FROM history_undo GROUP BY history_group ORDER BY history_group DESC
             LIMIT (SELECT group_limit FROM history_stats WHERE id = 1))"""


def _commit(db):
    bad = db.execute("SELECT code, detail FROM commit_violations").fetchall()
    if bad:
        raise sqlite3.IntegrityError(f"{bad[0][0]}: {bad[0][1]}")
    batch = db.execute("SELECT tbl, row_id, before, after FROM change_log ORDER BY seq").fetchall()
    db.execute("DELETE FROM change_log")
    db.execute("COMMIT")
    return batch


def edit(db, statements):
    """One user edit = one transaction = one history group. Returns the change-log batch."""
    db.execute("BEGIN")
    try:
        db.execute("UPDATE history_stats SET cur_undo_group = cur_undo_group + 1 WHERE id = 1")
        for st in statements:
            db.execute(st) if isinstance(st, str) else db.execute(*st)
        db.execute("DELETE FROM history_redo")          # a new edit discards the redo stack
        db.execute(PRUNE)
        return _commit(db)
    except sqlite3.DatabaseError:
        db.execute("ROLLBACK")
        raise


def undo(db):
    db.execute("BEGIN")
    try:
        g = db.execute("SELECT max(history_group) FROM history_undo").fetchone()[0]
        if g is None:
            db.execute("ROLLBACK"); return None
        mark = db.execute("SELECT coalesce(max(sequence), 0) FROM history_undo").fetchone()[0]
        for (s,) in db.execute("SELECT sql FROM history_undo WHERE history_group = ? ORDER BY sequence DESC", (g,)).fetchall():
            db.execute(s)
        db.execute("UPDATE history_stats SET cur_redo_group = cur_redo_group + 1 WHERE id = 1")
        db.execute("INSERT INTO history_redo(history_group, sql) SELECT (SELECT cur_redo_group FROM history_stats WHERE id = 1), sql "
                   "FROM history_undo WHERE sequence > ? ORDER BY sequence", (mark,))
        db.execute("DELETE FROM history_undo WHERE sequence > ? OR history_group = ?", (mark, g))
        return _commit(db)
    except sqlite3.DatabaseError:
        db.execute("ROLLBACK")
        raise


def redo(db):
    db.execute("BEGIN")
    try:
        g = db.execute("SELECT max(history_group) FROM history_redo").fetchone()[0]
        if g is None:
            db.execute("ROLLBACK"); return None
        db.execute("UPDATE history_stats SET cur_undo_group = cur_undo_group + 1 WHERE id = 1")
        for (s,) in db.execute("SELECT sql FROM history_redo WHERE history_group = ? ORDER BY sequence DESC", (g,)).fetchall():
            db.execute(s)
        db.execute("DELETE FROM history_redo WHERE history_group = ?", (g,))
        db.execute(PRUNE)
        return _commit(db)
    except sqlite3.DatabaseError:
        db.execute("ROLLBACK")
        raise


def dump(db):
    return {t: db.execute(f"SELECT * FROM {t} ORDER BY rowid").fetchall() for t in TRACKED}


# ---------------------------------------------------------------- undo-safe app procedures (§6.1)

def range_edit(db, tid, new_start, new_end):
    """R-E1 as an app procedure. Every intermediate state is valid, so the reverse replay is valid too:
         1. grow the transition to the union of the old and new ranges;
         2. move each anchored assignment, one statement per row;
         3. shrink the transition to the new range.
       A no-op step is skipped. Unanchored rows are left alone; if they no longer fit, step 3 is rejected (E-A1)."""
    s0, e0 = db.execute("SELECT start_beat, end_beat FROM transitions WHERE id = ?", (tid,)).fetchone()
    us, ue = min(s0, new_start), max(e0, new_end)
    out = []
    if (us, ue) != (s0, e0):
        out.append(("UPDATE transitions SET start_beat = ?, end_beat = ? WHERE id = ?", (us, ue, tid)))
    for rid, rs, re_ in db.execute("SELECT id, start_beat, end_beat FROM assignments WHERE transition_id = ? ORDER BY id", (tid,)).fetchall():
        ns = new_start if rs == s0 else rs
        ne = new_end if re_ == e0 else re_
        if (ns, ne) != (rs, re_):
            out.append(("UPDATE assignments SET start_beat = ?, end_beat = ? WHERE id = ?", (ns, ne, rid)))
    if (us, ue) != (new_start, new_end):
        out.append(("UPDATE transitions SET start_beat = ?, end_beat = ? WHERE id = ?", (new_start, new_end, tid)))
    return out
