// Cached, incremental resolver implementing spec §9 (push-dirty / pull-compile) and §10.2 (batches).
// rules: 'v0.2+' (current spec) or 'v0.1' (original invalidation rules, kept to reproduce review finding 1-2).
//
// The resolver keeps its own row index, updated only from batch row images (§10.2). It reads marchers,
// shapes and transitions by id from the host's post-commit mirror (`db`).
import { lerp, clamp01, destPath, paramT, destinationsOf, arcPoint, flatten, makeTrail } from './geom.mjs';

export function makeResolver(db, { rules = 'v0.2+' } = {}) {
  const T = (id) => db.transitions[id];
  const isFtl = (t) => !!t && t.style === 'follow_the_leader';

  // ---- row index (§10.2): rows by id, by marcher, by transition
  const rows = new Map(), byM = new Map(), byTR = new Map();
  const setOf = (map, k) => { if (!map.has(k)) map.set(k, new Set()); return map.get(k); };
  const addRow = (r) => { rows.set(r.id, r); setOf(byM, r.marcher).add(r.id); setOf(byTR, r.transition).add(r.id); };
  const dropRow = (r) => { rows.delete(r.id); byM.get(r.marcher)?.delete(r.id); byTR.get(r.transition)?.delete(r.id); };
  const rowsOfMarcher = (m) => [...(byM.get(m) ?? [])].map((id) => rows.get(id));
  const rowsOfTransition = (tid) => [...(byTR.get(tid) ?? [])].map((id) => rows.get(id));
  for (const r of db.assignments) addRow({ ...r });
  const homes = new Map(db.marchers.map((m) => [m.id, m.home]));

  // ---- local caches (§9.2 #1-4)
  const spans = new Map();        // marcher -> Span[]
  const byT = new Map();          // transition -> Set<Span>
  const dests = new Map();        // transition -> xy[]
  const paths = new Map();        // FTL transition -> exact destination path
  // ---- cascading caches (§9.2 #5-6)
  const origins = new Map();      // `${m}|${start}` -> xy
  const entries = new Map();      // FTL transition -> entry

  const C = { originsComputed: 0, ftlEntriesComputed: 0, destinationsComputed: 0, ftlGeometryComputed: 0,
              cacheHits: 0, cacheMisses: 0, dirtyVisits: 0, originsDirtied: 0, ftlEntriesDirtied: 0, spanLookups: 0 };

  const key = (s) => `${s.m}|${s.start}`;
  const idx = (tid) => setOf(byT, tid);
  const build = (m) => flatten(rowsOfMarcher(m)).map((s, k) => ({ ...s, m, k }));
  function indexAdd(list, only) { for (const s of list) if (s.row && (!only || only.has(s.row.transition))) idx(s.row.transition).add(s); }
  function indexRemove(list, only) { for (const s of list) if (s.row && (!only || only.has(s.row.transition))) byT.get(s.row.transition)?.delete(s); }
  function computeLocal(tid) {
    const t = T(tid);
    dests.set(tid, destinationsOf(t, db.shapes)); C.destinationsComputed++;          // shape or individual points (D-16)
    if (isFtl(t)) { paths.set(tid, destPath(db.shapes[t.dest])); C.ftlGeometryComputed++; } else paths.delete(tid);
  }

  for (const m of homes.keys()) { spans.set(m, build(m)); indexAdd(spans.get(m)); }
  for (const tid of Object.keys(db.transitions)) computeLocal(+tid);

  // ---- resolution (pull)
  const founding = (s) => !!s.row && s.start === T(s.row.transition).start;
  function kind(s) {
    if (!s.row) return 'hold';
    if (founding(s)) return 'founding';
    return spans.get(s.m).find((x) => x.row && x.row.id === s.row.id) === s ? 'join' : 'resume';
  }
  // Pull-compile with an explicit work stack (§9.5): dependency depth equals chain length, which can be
  // thousands of spans, so language recursion is not an option. Nodes are ['o', span] or ['e', transitionId].
  const isCached = ([kind, x]) => (kind === 'o' ? origins.has(key(x)) : entries.has(x));
  function depsOfOrigin(s) {                                           // exactly what computeOrigin reads
    if (s.k === 0) return [];
    const p = spans.get(s.m)[s.k - 1];
    if (p.row && isFtl(T(p.row.transition))) return [['o', p], ['e', p.row.transition]];
    return [['o', p]];
  }
  function depsOfEntry(tid) {                                          // exactly what computeEntry reads
    const t = T(tid), F = [...idx(tid)].filter(founding), d = F.map((s) => ['o', s]);
    if (t.order === 'inherit' && F.length) {
      const prevs = F.map(prevNonHold), U = prevs[0]?.row.transition;
      if (prevs.every((p) => p && p.row.transition === U) && isFtl(T(U)) && prevs.every((p) => founding(p))) d.push(['e', U]);
    }
    return d;
  }
  const nodeKey = ([kind, x]) => (kind === 'o' ? 'o|' + key(x) : 'e|' + x);
  function ensure(node) {
    const work = [node], expanding = new Set();
    while (work.length) {
      const top = work[work.length - 1];
      if (isCached(top)) { work.pop(); continue; }
      const missing = (top[0] === 'o' ? depsOfOrigin(top[1]) : depsOfEntry(top[1])).filter((d) => !isCached(d));
      if (missing.length) {
        // Back on top of the stack with dependencies still missing means a dependency is (transitively) waiting
        // on this node: a cycle. Valid data cannot produce one (§9.3); only an inconsistent cache can. Fail loudly.
        const k = nodeKey(top);
        if (expanding.has(k)) throw new Error(`dependency cycle at ${k}: derived state is inconsistent (§9.3, I-C1)`);
        expanding.add(k); work.push(...missing); continue;
      }
      work.pop();
      if (top[0] === 'o') computeOrigin(top[1]); else computeEntry(top[1]);
    }
  }
  function computeOrigin(s) {
    const v = s.k === 0 ? homes.get(s.m) : evalSpan(spans.get(s.m)[s.k - 1], s.start);   // all reads are cache hits
    origins.set(key(s), v); C.originsComputed++;
  }
  function origin(s) {
    const k = key(s);
    if (origins.has(k)) { C.cacheHits++; return origins.get(k); }
    C.cacheMisses++; ensure(['o', s]);
    return origins.get(k);
  }
  function evalSpan(s, b) {
    if (!s.row) return origin(s);
    const t = T(s.row.transition);
    if (isFtl(t) && founding(s)) {
      const e = entry(t.id), q = e.qOf.get(s.m), p = clamp01((b - t.start) / (t.end - t.start));   // q in O(1)
      if (p <= 0) return origin(s);                                    // endpoints exact (§8.10)
      if (p >= 1) return e.target.get(s.m);
      return e.trail.at(e.startDist[q] + (e.endDist[q] - e.startDist[q]) * p);
    }
    const p = clamp01((b - s.start) / (t.end - s.start));
    const o = origin(s);
    if (isFtl(t)) return lerp(o, entry(t.id).target.get(s.m), p);
    const dst = dests.get(t.id)[s.row.slot];
    return t.style === 'arc' ? arcPoint(o, dst, t.params?.bulge ?? 0, p) : lerp(o, dst, p);
  }
  function prevNonHold(s) { const l = spans.get(s.m); for (let j = s.k - 1; j >= 0; j--) if (l[j].row) return l[j]; return null; } // ≤ 2 steps: holds never abut
  function entry(tid) {
    if (entries.has(tid)) { C.cacheHits++; return entries.get(tid); }
    C.cacheMisses++; ensure(['e', tid]);
    return entries.get(tid);
  }
  function computeEntry(tid) {
    const t = T(tid);
    const F = [...idx(tid)].filter(founding);
    let keyed = null, source = { kind: 'slot', fallback: false };
    if (t.order === 'inherit' && F.length) {
      const prevs = F.map(prevNonHold);
      const U = prevs[0]?.row.transition;
      if (prevs.every((p) => p && p.row.transition === U)) {
        if (isFtl(T(U))) { if (prevs.every((p) => founding(p))) { const eu = entry(U); keyed = F.map((s) => [eu.qOf.get(s.m), s]); } }
        else keyed = F.map((s, i) => [prevs[i].row.slot, s]);
        if (keyed) source = { kind: 'inherit', fromTransitionId: U };
      }
      if (!keyed) source = { kind: 'slot', fallback: true };
    }
    if (!keyed) keyed = F.map((s) => [s.row.slot, s]);
    keyed.sort((a, b) => a[0] - b[0] || a[1].m - b[1].m);
    const members = keyed.map(([, s]) => s.m);
    const os = keyed.map(([, s]) => origin(s));
    const path = paths.get(tid), trail = makeTrail(os, t.params?.waypoints ?? [], path);
    const n = t.slots, m = members.length, pts = dests.get(tid);
    const e = { members, source, trail, qOf: new Map(members.map((mm, q) => [mm, q])),
      startDist: os.map((_, q) => trail.cum[q]),
      endDist: os.map((_, q) => trail.destOffset + paramT(path.closed, n - m + q, n) * path.L),
      target: new Map(members.map((mm, q) => [mm, pts[n - m + q]])) };
    rowsOfTransition(tid).filter((r) => !e.target.has(r.marcher))                  // per-transition index, no full scan
      .sort((a, b) => a.slot - b.slot || a.marcher - b.marcher)
      .forEach((r, k) => e.target.set(r.marcher, pts[n - m - 1 - k]));
    entries.set(tid, e); C.ftlEntriesComputed++;
  }
  function positionAt(m, b) {
    C.spanLookups++;
    const l = spans.get(m);
    let lo = 0, hi = l.length - 1;                     // binary search: last span with start <= b
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (l[mid].start <= b) lo = mid; else hi = mid - 1; }
    return evalSpan(l[lo], b);
  }

  // ---- invalidation (push)
  function dirtyWalk(start) {                                         // W-1, W-2, W-4 with an explicit work stack
    const work = [start];
    while (work.length) {
      const [kind, x] = work.pop();
      if (kind === 'o') {
        if (!x || !origins.delete(key(x))) continue;                   // W-4: already dirty
        C.dirtyVisits++; C.originsDirtied++;
        const nx = spans.get(x.m)[x.k + 1]; if (nx) work.push(['o', nx]);                          // W-1
        if (x.row && isFtl(T(x.row.transition)) && founding(x)) work.push(['e', x.row.transition]);
      } else {
        if (!entries.delete(x)) continue;
        C.dirtyVisits++; C.ftlEntriesDirtied++;
        for (const s of idx(x)) { const nx = spans.get(s.m)[s.k + 1]; if (nx) work.push(['o', nx]); } // W-2
      }
    }
  }
  const dirtyOrigin = (s) => dirtyWalk(['o', s]);
  const dirtyEntry = (tid) => dirtyWalk(['e', tid]);
  function seed(tid) { for (const s of idx(tid)) dirtyOrigin(spans.get(s.m)[s.k + 1]); dirtyEntry(tid); }   // W-3

  /** §10.2: reduce a change log to one net change per row id (first before-image, last after-image). */
  function coalesce(list, idOf) {
    const net = new Map();
    for (const c of list ?? []) { const id = idOf(c); if (!net.has(id)) net.set(id, { ...c }); else net.get(id).after = c.after; }
    return [...net.values()].filter((c) => c.before || c.after);
  }

  /** batch = { rows:[{before,after}], transitions:[{id,before,after}], shapes:[id], marchers:[{id}], destinations:[transitionId] } (§9.4 order). */
  function applyBatch(raw) {
    const batch = { rows: coalesce(raw.rows, (c) => (c.before ?? c.after).id),
                    transitions: coalesce(raw.transitions, (c) => c.id),
                    shapes: [...new Set(raw.shapes ?? [])], marchers: [...new Set((raw.marchers ?? []).map((c) => c.id))] };
    // update the row index and homes from the batch
    for (const { before, after } of batch.rows) { if (before) dropRow(before); if (after) addRow({ ...after }); }
    for (const m of batch.marchers) { const rec = db.marchers.find((x) => x.id === m); if (rec) homes.set(m, rec.home); else homes.delete(m); }

    // 1-2. affected marchers and their earliest affected beat b0
    const affected = new Map();
    const touch = (m, b) => affected.set(m, Math.min(affected.get(m) ?? Infinity, b));
    const rowTs = new Map();
    for (const { before, after } of batch.rows) for (const r of [before, after]) if (r) {
      touch(r.marcher, r.start); setOf(rowTs, r.marcher).add(r.transition);
    }
    for (const tc of batch.transitions) if (tc.before && tc.after && (tc.before.start !== tc.after.start || tc.before.end !== tc.after.end))
      for (const r of rowsOfTransition(tc.id)) touch(r.marcher, Math.min(tc.before.start, tc.after.start));
    for (const m of batch.marchers) touch(m, -Infinity);

    // 3. per affected marcher
    for (const [m, b0] of affected) {
      const old = spans.get(m) ?? [];
      for (const s of old) if (s.start >= b0) dirtyOrigin(s);           // 3.1 evict along the OLD structure
      if (!homes.has(m)) {                                               // marcher deleted
        indexRemove(old); spans.delete(m);
        const Ts = new Set([...old.filter((s) => s.row).map((s) => s.row.transition), ...(rowTs.get(m) ?? [])]);
        for (const tid of Ts) if (isFtl(T(tid)) || entries.has(tid)) dirtyEntry(tid);
        continue;
      }
      const neu = build(m);                                              // 3.2
      if (rules === 'v0.1') {
        const oldFounding = new Set(old.filter((s) => s.row && T(s.row.transition) && founding(s)).map((s) => s.row.transition));
        const only = rowTs.get(m) ?? new Set();
        indexRemove(old, only); spans.set(m, neu); indexAdd(neu, only);
        const newFounding = new Set(neu.filter((s) => s.row && founding(s)).map((s) => s.row.transition));
        for (const tid of new Set([...oldFounding, ...newFounding])) if (isFtl(T(tid))) dirtyEntry(tid);
      } else {
        indexRemove(old); spans.set(m, neu); indexAdd(neu);             // 3.3 re-index every T in old ∪ new
        const Ts = new Set([...old, ...neu].filter((s) => s.row).map((s) => s.row.transition));
        for (const tid of rowTs.get(m) ?? []) Ts.add(tid);
        for (const tid of Ts) if (isFtl(T(tid)) || entries.has(tid)) dirtyEntry(tid);   // 3.4
      }
    }

    // 4. transition and shape changes: recompute local caches, then seed W-3 with the new index
    const seedTs = new Set();
    for (const tc of batch.transitions) {
      if (!tc.after) { dests.delete(tc.id); paths.delete(tc.id); dirtyEntry(tc.id); entries.delete(tc.id); byT.delete(tc.id); byTR.delete(tc.id); continue; }
      computeLocal(tc.id); seedTs.add(tc.id);
    }
    for (const tid of new Set(raw.destinations ?? [])) if (db.transitions[tid]) { computeLocal(tid); seedTs.add(tid); }   // individual points edited
    for (const sid of batch.shapes)
      for (const t of Object.values(db.transitions)) if (t.dest === sid) { computeLocal(t.id); seedTs.add(t.id); }
    for (const tid of seedTs) seed(tid);
  }

  function checkCacheClosure() {                                       // I-C1
    const live = new Set(); for (const l of spans.values()) for (const s of l) live.add(key(s));
    for (const k of origins.keys()) if (!live.has(k)) return `stale origin key ${k}`;
    for (const l of spans.values()) for (const s of l) {
      if (!origins.has(key(s)) || s.k === 0) continue;
      const p = l[s.k - 1];
      if (p.row && isFtl(T(p.row.transition)) && !entries.has(p.row.transition)) return `origin ${key(s)} cached but entry ${p.row.transition} not`;
      if (!(p.row && isFtl(T(p.row.transition)) && founding(p)) && !origins.has(key(p))) return `origin ${key(s)} cached but prev ${key(p)} not`;
    }
    for (const tid of entries.keys()) for (const s of idx(tid)) if (founding(s) && !origins.has(key(s))) return `entry ${tid} cached but founder ${key(s)} not`;
    return true;
  }

  return { positionAt, applyBatch, checkCacheClosure, entry, kind, spans: (m) => spans.get(m),
    counters: () => ({ ...C }), resetCounters: () => { for (const k in C) C[k] = 0; },
    warmAll() { for (const m of spans.keys()) for (const s of spans.get(m)) origin(s); } };
}
