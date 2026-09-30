// End-to-end fuzz: random SQL edits, undos and redos -> SQLite (schema.sql enforces §6; history.mjs is the app's
// undo model, §6.1) -> change_log -> batch -> resolver, compared after every commit against a fresh oracle.
// Undo and redo must never be rejected and must restore the exact snapshot (QA-UNDO-9).
// usage: node --no-warnings e2e.mjs [seeds=100] [steps=60] [--v06-anchor --expect-fail]
//   --v06-anchor puts back the v0.6 range-anchoring trigger (negative control: undo must break).
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { makeOracle } from './oracle.mjs';
import { makeResolver } from './resolver.mjs';
import * as H from './history.mjs';

const FLAGS = process.argv.slice(2).filter((a) => a.startsWith('--'));
const [SEEDS = '100', STEPS = '60'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const V06 = FLAGS.includes('--v06-anchor'), EXPECT_FAIL = FLAGS.includes('--expect-fail');
const V06_ANCHOR = `DROP TRIGGER tr_range_check;   -- exactly the v0.6 trigger
CREATE TRIGGER tr_range_anchor AFTER UPDATE OF start_beat, end_beat ON transitions
BEGIN
  UPDATE assignments
     SET start_beat = CASE WHEN start_beat = OLD.start_beat THEN NEW.start_beat ELSE start_beat END,
         end_beat   = CASE WHEN end_beat   = OLD.end_beat   THEN NEW.end_beat   ELSE end_beat   END
   WHERE transition_id = NEW.id
     AND (start_beat = OLD.start_beat OR end_beat = OLD.end_beat);
  SELECT RAISE(ABORT, 'E-A1: range change strands an unanchored assignment')
   WHERE EXISTS (SELECT 1 FROM assignments a WHERE a.transition_id = NEW.id
                 AND (a.start_beat < NEW.start_beat OR a.end_beat > NEW.end_beat));
END;`;
const SCHEMA = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** One user edit through the §6 write wrapper (history.mjs): returns the change log, or { error } if rejected. */
function edit(sql, statements) {
  try { return H.edit(sql, statements); } catch (e) { return { error: e.message }; }
}
const GROUP_LIMIT = 20;   // small, so pruning happens within a run

/** §10.2: change log -> resolver batch (the resolver coalesces per row id). */
function toBatch(log) {
  const b = { rows: [], transitions: [], shapes: [], marchers: [] };
  const J = (s) => (s == null ? null : JSON.parse(s));
  for (const { tbl, row_id, before, after } of log) {
    if (tbl === 'assignments') b.rows.push({ before: J(before), after: J(after) });
    else if (tbl === 'transitions') b.transitions.push({ id: row_id, before: J(before), after: J(after) });
    else if (tbl === 'shapes') b.shapes.push(row_id);
    else if (tbl === 'slot_destinations') (b.destinations ??= []).push(row_id);   // row_id is the transition id
    else if (tbl === 'marchers') b.marchers.push({ id: row_id });   // insert, delete or home change
  }
  return b;
}

/** Load the database into the in-memory shape the oracle and resolver read (mutates `db` in place). */
function load(sql, db) {
  db.marchers = sql.prepare('SELECT id, home_x, home_y FROM marchers ORDER BY id').all().map((r) => ({ id: r.id, home: [r.home_x, r.home_y] }));
  db.shapes = Object.fromEntries(sql.prepare('SELECT id, kind, geometry FROM shapes').all().map((r) => [r.id, { kind: r.kind, geometry: JSON.parse(r.geometry) }]));
  const pts = new Map();
  for (const d of sql.prepare('SELECT * FROM slot_destinations ORDER BY transition_id, slot_index').all()) {
    if (!pts.has(d.transition_id)) pts.set(d.transition_id, []);
    pts.get(d.transition_id)[d.slot_index] = [d.x, d.y];
  }
  db.transitions = Object.fromEntries(sql.prepare('SELECT * FROM transitions').all().map((r) => [r.id,
    { id: r.id, dest: r.dest_shape_id, style: r.path_style, params: r.path_params ? JSON.parse(r.path_params) : null, order: r.order_mode, slots: r.slot_count, start: r.start_beat, end: r.end_beat,
      ...(r.dest_shape_id == null ? { points: pts.get(r.id) ?? [] } : {}) }]));
  db.assignments = sql.prepare('SELECT * FROM assignments').all().map((r) =>
    ({ id: r.id, marcher: r.marcher_id, transition: r.transition_id, slot: r.slot_index, start: r.start_beat, end: r.end_beat, layer: r.layer }));
  return db;
}

const stats = { seeds: 0, commits: 0, rejected: 0, rejectReasons: {}, divergent: 0, closure: 0, exceptions: 0, maxAssignments: 0,
                undos: 0, redos: 0, undoEmpty: 0, redoEmpty: 0, undoRejected: 0, redoRejected: 0, snapshotMismatch: 0, rangeEdits: 0, rangeEditCommits: 0 };
const failures = [];
for (let seed = 1; seed <= +SEEDS; seed++) {
  const R = mulberry32(seed * 7919);
  const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
  const pick = (xs) => xs[Math.floor(R() * xs.length)];
  const pt = () => [ri(-10, 10), ri(-10, 10)];
  const shapeJson = () => {
    const k = pick(['line', 'freehand', 'circle', 'box']);
    if (k === 'line') { const a = pt(); return [k, JSON.stringify({ points: [a, [a[0] + ri(1, 6), a[1] + ri(-3, 3)]] })]; }
    if (k === 'freehand') { const p = [pt()]; for (let i = 0; i < ri(1, 3); i++) p.push(pt()); p.push([p[0][0] + 1, p[0][1]]); return [k, JSON.stringify({ points: p })]; }
    if (k === 'circle') return [k, JSON.stringify({ center: pt(), radius: ri(1, 6), start_angle: +(R() * 6).toFixed(3), clockwise: R() < 0.5 })];
    return [k, JSON.stringify({ origin: pt(), width: ri(1, 6), height: ri(1, 6) })];
  };
  const params = (style) => (style === 'arc' ? JSON.stringify({ bulge: +(R() - 0.5).toFixed(3) })
    : style === 'follow_the_leader' ? JSON.stringify({ waypoints: Array.from({ length: ri(0, 2) }, pt) }) : null);

  const sql = new DatabaseSync(':memory:');
  sql.exec(SCHEMA);
  if (V06) sql.exec(V06_ANCHOR);
  H.install(sql, GROUP_LIMIT);
  sql.exec('PRAGMA foreign_keys = ON');
  const setup = [["INSERT INTO timelines VALUES (1,'show',0,40)"]];
  for (let m = 1; m <= ri(4, 7); m++) { const [x, y] = pt(); setup.push(['INSERT INTO marchers VALUES (?,?,?,?)', m, 'M' + m, x, y]); }
  for (let s = 1; s <= 6; s++) setup.push(['INSERT INTO shapes VALUES (?,?,?,?)', s, 'S' + s, ...shapeJson()]);
  edit(sql, setup);
  const addTransition = () => {
    const s = ri(0, 36), e = ri(s + 1, Math.min(40, s + 12)), style = pick(['direct', 'arc', 'follow_the_leader', 'follow_the_leader']);
    return ['INSERT INTO transitions(timeline_id,dest_shape_id,path_style,path_params,order_mode,slot_count,start_beat,end_beat) VALUES (1,?,?,?,?,?,?,?)',
      ri(1, 6), style, params(style), R() < 0.8 ? 'inherit' : 'slot', ri(1, 5), s, e];
  };
  const nextTid = () => (sql.prepare('SELECT coalesce(max(id), 0) + 1 AS n FROM transitions').get().n);
  const addIndividual = () => {   // D-16: a shapeless transition and all its points, in one edit
    const id = nextTid(), n = ri(1, 5), s = ri(0, 36), e = ri(s + 1, Math.min(40, s + 12)), style = pick(['direct', 'arc']);
    return [['INSERT INTO transitions(id,timeline_id,dest_shape_id,path_style,path_params,order_mode,slot_count,start_beat,end_beat) VALUES (?,1,NULL,?,?,?,?,?,?)',
             id, style, params(style), 'inherit', n, s, e],
            ...Array.from({ length: n }, (_, k) => ['INSERT INTO slot_destinations VALUES (?,?,?,?)', id, k, ...pt()])];
  };
  for (let i = 0; i < ri(6, 10); i++) edit(sql, R() < 0.3 ? addIndividual() : [addTransition()]);
  const ids = (tbl) => sql.prepare(`SELECT id FROM ${tbl}`).all().map((r) => r.id);
  const trow = (id) => sql.prepare('SELECT * FROM transitions WHERE id=?').get(id);
  const randAssign = (layer) => {
    const t = trow(pick(ids('transitions'))); if (!t) return null;
    const full = R() < 0.6, s = full ? t.start_beat : ri(t.start_beat, t.end_beat - 1), e = full ? t.end_beat : ri(s + 1, t.end_beat);
    return ['INSERT INTO assignments(marcher_id,transition_id,slot_index,start_beat,end_beat,layer) VALUES (?,?,?,?,?,?)',
      pick(ids('marchers')), t.id, ri(0, t.slot_count - 1), s, e, layer ?? pick([0, 0, 0, 1, 2])];
  };
  for (let i = 0; i < 60; i++) { const a = randAssign(); if (a) edit(sql, [a]); }
  sql.exec('DELETE FROM change_log');
  sql.exec('DELETE FROM history_undo');     // the generated show is the starting point, not undoable

  const db = load(sql, {});
  const undoSnaps = [], redoSnaps = [];     // expected states: what the next undo / redo must restore
  const res = makeResolver(db);
  stats.seeds++;

  const ops = [
    () => randAssign(),
    () => randAssign(ri(1, 3)),                                                                  // steal
    () => { const a = ids('assignments'); return a.length ? ['DELETE FROM assignments WHERE id=?', pick(a)] : null; },
    () => { const a = ids('assignments'); if (!a.length) return null; const f = pick(['layer', 'start_beat', 'end_beat', 'slot_index']);
            return [`UPDATE assignments SET ${f} = ${f} + ? WHERE id=?`, pick([-2, -1, 1, 2]), pick(a)]; },
    () => { const t = pick(ids('transitions')); return t ? ['UPDATE transitions SET start_beat = start_beat + ?, end_beat = end_beat + ? WHERE id=?', ri(-3, 3), ri(-3, 3), t] : null; }, // raw: E-A1 if it strands a row
    () => { const t = pick(ids('transitions')), st = pick(['direct', 'arc', 'follow_the_leader']); return t ? ['UPDATE transitions SET path_style=?, path_params=? WHERE id=?', st, params(st), t] : null; },
    () => { const t = pick(ids('transitions')); return t ? ["UPDATE transitions SET order_mode = CASE order_mode WHEN 'inherit' THEN 'slot' ELSE 'inherit' END WHERE id=?", t] : null; },
    () => { const t = pick(ids('transitions')); return t ? ['UPDATE transitions SET slot_count = ? WHERE id=?', ri(1, 6), t] : null; },
    () => { const t = pick(ids('transitions')); return t ? ['UPDATE transitions SET dest_shape_id = ? WHERE id=?', ri(1, 6), t] : null; },
    () => (ids('transitions').length > 3 ? ['DELETE FROM transitions WHERE id=?', pick(ids('transitions'))] : null),   // FK cascade
    () => addTransition(),
    () => ['UPDATE shapes SET geometry = ?, kind = ? WHERE id=?', ...shapeJson().reverse(), ri(1, 6)],
    () => ['UPDATE marchers SET home_x = ?, home_y = ? WHERE id=?', ...pt(), pick(ids('marchers'))],
    () => ['INSERT INTO marchers(label, home_x, home_y) VALUES (?,?,?)', 'new', ...pt()],
    () => { const d = sql.prepare('SELECT transition_id, slot_index FROM slot_destinations').all(); if (!d.length) return null;   // move one placed point
            const x = pick(d); return ['UPDATE slot_destinations SET x = ?, y = ? WHERE transition_id = ? AND slot_index = ?', ...pt(), x.transition_id, x.slot_index]; },
    () => { const d = sql.prepare('SELECT transition_id, slot_index FROM slot_destinations').all(); if (!d.length) return null;   // unplace a point: must be rejected at commit
            const x = pick(d); return ['DELETE FROM slot_destinations WHERE transition_id = ? AND slot_index = ?', x.transition_id, x.slot_index]; },
    () => (ids('marchers').length > 2 ? ['DELETE FROM marchers WHERE id=?', pick(ids('marchers'))] : null),   // cascades rows
  ];

  for (let step = 0; step < +STEPS; step++) {
    const multi = [
      () => { const t = !V06 && trow(pick(ids('transitions'))); if (!t) return null; stats.rangeEdits++;   // R-E1 procedure (§6.1); v0.6 had none
              const s = Math.max(0, t.start_beat + ri(-4, 4)), e = Math.max(s + 1, t.end_beat + ri(-4, 4)); return H.rangeEdit(sql, t.id, s, e); },
      () => { const t = !V06 && trow(pick(ids('transitions'))); if (!t) return null; stats.rangeEdits++;   // procedure, shift
              const d = ri(-4, 4); return H.rangeEdit(sql, t.id, Math.max(0, t.start_beat + d), Math.max(0, t.start_beat + d) + (t.end_beat - t.start_beat)); },
      () => addIndividual(),
      () => { const t = sql.prepare("SELECT * FROM transitions WHERE dest_shape_id IS NOT NULL AND path_style <> 'follow_the_leader'").all(); if (!t.length) return null;
              const x = pick(t); return [['UPDATE transitions SET dest_shape_id = NULL WHERE id = ?', x.id],
                                         ...Array.from({ length: x.slot_count }, (_, k) => ['INSERT INTO slot_destinations VALUES (?,?,?,?)', x.id, k, ...pt()])]; },
      () => { const t = sql.prepare('SELECT * FROM transitions WHERE dest_shape_id IS NULL').all(); if (!t.length) return null;
              const x = pick(t); return [['DELETE FROM slot_destinations WHERE transition_id = ?', x.id], ['UPDATE transitions SET dest_shape_id = ? WHERE id = ?', ri(1, 6), x.id]]; },
      () => { const t = sql.prepare('SELECT * FROM transitions WHERE dest_shape_id IS NULL').all(); if (!t.length) return null;   // grow and place
              const x = pick(t); return [['UPDATE transitions SET slot_count = ? WHERE id = ?', x.slot_count + 1, x.id], ['INSERT INTO slot_destinations VALUES (?,?,?,?)', x.id, x.slot_count, ...pt()]]; },
    ];
    const u = R();
    let log, stmts = [];
    if (u < 0.14 || (u < 0.28 && redoSnaps.length) || u > 0.98) {   // undo or redo (sometimes a burst; sometimes on an empty stack)
      const isUndo = u < 0.14, n = R() < 0.3 ? ri(2, 5) : 1;
      let broke = null;
      for (let k = 0; k < n && !broke; k++) {
        const before = H.dump(sql), expect = (isUndo ? undoSnaps : redoSnaps).at(-1);
        try { log = isUndo ? H.undo(sql) : H.redo(sql); }
        catch (e) { stats[isUndo ? 'undoRejected' : 'redoRejected']++; broke = { rejected: e.message }; break; }
        if (log === null) { stats[isUndo ? 'undoEmpty' : 'redoEmpty']++; if (expect !== undefined) broke = { emptyButExpected: true }; break; }
        stats[isUndo ? 'undos' : 'redos']++;
        (isUndo ? undoSnaps : redoSnaps).pop(); (isUndo ? redoSnaps : undoSnaps).push(before);
        if (!isUndo && undoSnaps.length > GROUP_LIMIT) undoSnaps.shift();
        if (H.dump(sql) !== expect) { stats.snapshotMismatch++; broke = { snapshot: true }; break; }
        const v = verify(log); if (v) { broke = v; break; }
      }
      if (broke) { if (failures.length < 3) failures.push({ seed, step, op: isUndo ? 'undo' : 'redo', broke }); break; }
      continue;
    }
    const nRange = stats.rangeEdits;
    for (let i = 0; i < (R() < 0.7 ? 1 : ri(2, 3)); i++) {
      if (R() < 0.2) { const s = pick(multi)(); if (s) stmts.push(...s); } else { const s = pick(ops)(); if (s) stmts.push(s); }
    }
    if (!stmts.length) continue;
    const before = H.dump(sql);
    log = edit(sql, stmts);
    if (log.error) { stats.rejected++; const k = log.error.replace(/: .*/, '').slice(0, 40); stats.rejectReasons[k] = (stats.rejectReasons[k] ?? 0) + 1; continue; }
    stats.commits++;
    if (stats.rangeEdits !== nRange) stats.rangeEditCommits++;
    redoSnaps.length = 0;
    if (sql.prepare('SELECT count(*) AS n FROM history_undo WHERE history_group = (SELECT cur_undo_group FROM history_stats WHERE id = 1)').get().n) {
      undoSnaps.push(before); if (undoSnaps.length > GROUP_LIMIT) undoSnaps.shift();
    }
    const v = verify(log);
    if (v) { if (failures.length < 3) failures.push({ seed, step, stmts: stmts.map((s) => s[0].slice(0, 50)), ...v }); break; }
  }

  /** After any commit: the resolver, fed only the change log, must match a fresh oracle and keep cache closure. */
  function verify(log) {
    let bad = null, cc = true;
    try {
      load(sql, db);                       // mirror now holds the post-commit state
      const batch = toBatch(log); if (batch.destinations?.length) stats.destinationBatches = (stats.destinationBatches ?? 0) + 1;
      res.applyBatch(batch);               // the resolver only learns what the change log tells it
      cc = res.checkCacheClosure();
      const o = makeOracle(db);
      outer: for (const m of db.marchers) for (let b = -1; b <= 42; b += 0.5) {
        if (R() > (R() < 0.4 ? 0.25 : 1)) continue;
        const x = res.positionAt(m.id, b), y = o.positionAt(m.id, b);
        if (!(Math.abs(x[0] - y[0]) < 1e-6 && Math.abs(x[1] - y[1]) < 1e-6)) { bad = { m: m.id, b, x, y }; break outer; }
      }
    } catch (e) { bad = { exception: e.message }; stats.exceptions++; }
    stats.maxAssignments = Math.max(stats.maxAssignments, db.assignments.length);
    if (bad || cc !== true) { if (bad) stats.divergent++; if (cc !== true) stats.closure++; return { bad, cc }; }
    return null;
  }
}
console.log(JSON.stringify({ ...stats, failures }, null, 1));
const undoFail = stats.undoRejected + stats.redoRejected + stats.snapshotMismatch;
console.log(`${stats.commits} commits (${stats.destinationBatches ?? 0} with individual-point changes), ${stats.rejected} rejected by the database; ` +
  `${stats.undos} undos + ${stats.redos} redos, ${undoFail} rejected or inexact; ${stats.divergent} divergent, ${stats.closure} closure violations, ${stats.exceptions} exceptions`);
const failed = stats.divergent + stats.closure + stats.exceptions + undoFail > 0 || failures.length > 0;
if (EXPECT_FAIL) { console.log(failed ? `expected failure reproduced: undo broke in ${undoFail} of ${stats.seeds} seeds` : 'expected failures NOT reproduced'); process.exitCode = failed ? 0 : 1; }
else if (failed) process.exitCode = 1;
