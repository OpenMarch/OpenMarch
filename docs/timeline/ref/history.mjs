// Reference undo/redo on the app's history tables (spec §6.1), for node:sqlite. Mirrors history.py.
// Inverse SQL per row change, grouped per edit; undo replays a group in reverse sequence order; redo replays the
// statements undo generated, also in reverse. Every call runs inside the §6 write wrapper and returns its change log.

export const TRACKED = ['marchers', 'shapes', 'timelines', 'transitions', 'assignments', 'slot_destinations'];

const HISTORY_DDL = `
CREATE TABLE history_undo (sequence INTEGER PRIMARY KEY, history_group INTEGER NOT NULL, sql TEXT NOT NULL);
CREATE TABLE history_redo (sequence INTEGER PRIMARY KEY, history_group INTEGER NOT NULL, sql TEXT NOT NULL);
CREATE TABLE history_stats (id INTEGER PRIMARY KEY CHECK (id = 1), cur_undo_group INTEGER NOT NULL,
                            cur_redo_group INTEGER NOT NULL, group_limit INTEGER NOT NULL);
INSERT INTO history_stats VALUES (1, 0, 0, 500);`;

// Keep the newest group_limit groups; whole groups are dropped from the old end only.
const PRUNE = `DELETE FROM history_undo WHERE history_group NOT IN (
  SELECT history_group FROM history_undo GROUP BY history_group ORDER BY history_group DESC
  LIMIT (SELECT group_limit FROM history_stats WHERE id = 1))`;

export function install(sql, groupLimit = 500) {
  sql.exec(HISTORY_DDL);
  const grp = '(SELECT cur_undo_group FROM history_stats WHERE id = 1)';
  for (const t of TRACKED) {
    const cols = sql.prepare(`PRAGMA table_info(${t})`).all().map((r) => r.name);
    const ins = `'DELETE FROM ${t} WHERE rowid=' || NEW.rowid`;
    const upd = `'UPDATE ${t} SET ' || ${cols.map((c) => `'${c}=' || quote(OLD.${c})`).join(" || ',' || ")} || ' WHERE rowid=' || OLD.rowid`;
    const del = `'INSERT INTO ${t}(rowid,${cols.join(',')}) VALUES(' || OLD.rowid || ',' || ${cols.map((c) => `quote(OLD.${c})`).join(" || ',' || ")} || ')'`;
    for (const [ev, body] of [['INSERT', ins], ['UPDATE', upd], ['DELETE', del]])
      sql.exec(`CREATE TRIGGER hist_${t}_${ev.toLowerCase()} AFTER ${ev} ON ${t} BEGIN INSERT INTO history_undo(history_group, sql) VALUES (${grp}, ${body}); END;`);
  }
  sql.prepare('UPDATE history_stats SET group_limit = ? WHERE id = 1').run(groupLimit);
}

/** The §6 write wrapper around fn: BEGIN, fn, commit-time checks, read + clear change log, COMMIT. Throws on rejection. */
function wrapped(sql, fn) {
  sql.exec('BEGIN');
  try {
    if (fn() === null) { sql.exec('ROLLBACK'); return null; }
    const bad = sql.prepare('SELECT code, detail FROM commit_violations').all();
    if (bad.length) throw new Error(`${bad[0].code}: ${bad[0].detail}`);
    const log = sql.prepare('SELECT tbl, row_id, before, after FROM change_log ORDER BY seq').all();
    sql.exec('DELETE FROM change_log');
    sql.exec('COMMIT');
    return log;
  } catch (e) { sql.exec('ROLLBACK'); throw e; }
}

/** One user edit = one transaction = one history group. statements: [[sql, ...args], ...] */
export const edit = (sql, statements) => wrapped(sql, () => {
  sql.exec('UPDATE history_stats SET cur_undo_group = cur_undo_group + 1 WHERE id = 1');
  for (const [q, ...args] of statements) sql.prepare(q).run(...args);
  sql.exec('DELETE FROM history_redo');
  sql.exec(PRUNE);
});

export const undo = (sql) => wrapped(sql, () => {
  const g = sql.prepare('SELECT max(history_group) AS g FROM history_undo').get().g;
  if (g == null) return null;
  const mark = sql.prepare('SELECT coalesce(max(sequence), 0) AS m FROM history_undo').get().m;
  for (const { sql: s } of sql.prepare('SELECT sql FROM history_undo WHERE history_group = ? ORDER BY sequence DESC').all(g)) sql.exec(s);
  sql.exec('UPDATE history_stats SET cur_redo_group = cur_redo_group + 1 WHERE id = 1');
  sql.prepare(`INSERT INTO history_redo(history_group, sql) SELECT (SELECT cur_redo_group FROM history_stats WHERE id = 1), sql
               FROM history_undo WHERE sequence > ? ORDER BY sequence`).run(mark);
  sql.prepare('DELETE FROM history_undo WHERE sequence > ? OR history_group = ?').run(mark, g);
});

export const redo = (sql) => wrapped(sql, () => {
  const g = sql.prepare('SELECT max(history_group) AS g FROM history_redo').get().g;
  if (g == null) return null;
  sql.exec('UPDATE history_stats SET cur_undo_group = cur_undo_group + 1 WHERE id = 1');
  for (const { sql: s } of sql.prepare('SELECT sql FROM history_redo WHERE history_group = ? ORDER BY sequence DESC').all(g)) sql.exec(s);
  sql.prepare('DELETE FROM history_redo WHERE history_group = ?').run(g);
  sql.exec(PRUNE);
});

export const dump = (sql) => JSON.stringify(TRACKED.map((t) => sql.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()));

/** R-E1 as an app procedure (§6.1): grow to the union, move anchored rows one statement each, shrink to the target.
 *  Every intermediate state is valid, so the reverse replay is valid too. Unanchored rows that no longer fit make the
 *  final shrink fail with E-A1, which rejects the whole edit. */
export function rangeEdit(sql, tid, ns, ne) {
  const t = sql.prepare('SELECT start_beat AS s, end_beat AS e FROM transitions WHERE id = ?').get(tid);
  if (!t) return [];
  const us = Math.min(t.s, ns), ue = Math.max(t.e, ne), out = [];
  if (us !== t.s || ue !== t.e) out.push(['UPDATE transitions SET start_beat = ?, end_beat = ? WHERE id = ?', us, ue, tid]);
  for (const a of sql.prepare('SELECT id, start_beat AS s, end_beat AS e FROM assignments WHERE transition_id = ? ORDER BY id').all(tid)) {
    const s2 = a.s === t.s ? ns : a.s, e2 = a.e === t.e ? ne : a.e;
    if (s2 !== a.s || e2 !== a.e) out.push(['UPDATE assignments SET start_beat = ?, end_beat = ? WHERE id = ?', s2, e2, a.id]);
  }
  if (us !== ns || ue !== ne) out.push(['UPDATE transitions SET start_beat = ?, end_beat = ? WHERE id = ?', ns, ne, tid]);
  return out;
}
