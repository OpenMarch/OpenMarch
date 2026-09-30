// Reference oracle: uncached, spec-literal implementation of §8. Deliberately naive.
// db shape: { marchers:[{id,home:[x,y]}], shapes:{id:{kind,geometry}},
//             transitions:{id:{id,start,end,dest,slots,style,order,params}},
//             assignments:[{id,marcher,transition,slot,start,end,layer}] }
import { lerp, clamp01, destPath, paramT, destinationsOf, arcPoint, flatten, makeTrail } from './geom.mjs';

export function makeOracle(db) {
  const T = (id) => db.transitions[id];
  const spanCache = new Map(); // structural memo only: flatten is pure
  const spans = (m) => {
    if (!spanCache.has(m)) spanCache.set(m, flatten(db.assignments.filter((r) => r.marcher === m)).map((s, k) => ({ ...s, m, k })));
    return spanCache.get(m);
  };
  const home = (m) => db.marchers.find((x) => x.id === m).home;

  function kind(sp) { // R-3
    if (!sp.row) return 'hold';
    if (sp.start === T(sp.row.transition).start) return 'founding';
    return spans(sp.m).find((x) => x.row && x.row.id === sp.row.id) === sp ? 'join' : 'resume';
  }
  const oMemo = new Map(), eMemo = new Map();
  const origin = (sp) => { if (!oMemo.has(sp)) oMemo.set(sp, sp.k === 0 ? home(sp.m) : evalSpan(spans(sp.m)[sp.k - 1], sp.start)); return oMemo.get(sp); }; // R-4

  function evalSpan(sp, b) {
    if (!sp.row) return origin(sp);                                                   // R-6
    const t = T(sp.row.transition);
    if (t.style === 'follow_the_leader' && kind(sp) === 'founding') {                  // R-10
      const e = ftlEntry(t.id), q = e.members.indexOf(sp.m), p = clamp01((b - t.start) / (t.end - t.start));
      if (p <= 0) return origin(sp);                                                   // endpoints exact (§8.10)
      if (p >= 1) return e.target.get(sp.m);
      return e.trail.at(e.startDist[q] + (e.endDist[q] - e.startDist[q]) * p);
    }
    const p = clamp01((b - sp.start) / (t.end - sp.start));                            // R-5
    const o = origin(sp);
    if (t.style === 'follow_the_leader') return lerp(o, ftlEntry(t.id).target.get(sp.m), p); // R-11
    const dst = destinationsOf(t, db.shapes)[sp.row.slot];
    return t.style === 'arc' ? arcPoint(o, dst, t.params?.bulge ?? 0, p) : lerp(o, dst, p); // R-8 / R-7
  }

  function prevNonHold(sp) { const s = spans(sp.m); for (let j = sp.k - 1; j >= 0; j--) if (s[j].row) return s[j]; return null; }

  function ftlEntry(tid) { if (!eMemo.has(tid)) eMemo.set(tid, ftlEntryRaw(tid)); return eMemo.get(tid); }
  function ftlEntryRaw(tid) { // R-9, R-12
    const t = T(tid);
    const founding = db.marchers.map((mm) => spans(mm.id).find((s) => s.row && s.row.transition === tid && s.start === t.start)).filter(Boolean);
    let keyed = null, source = { kind: 'slot', fallback: false };
    if (t.order === 'inherit' && founding.length) {
      const prevs = founding.map(prevNonHold);
      const U = prevs[0]?.row.transition;
      if (prevs.every((p) => p && p.row.transition === U)) {
        if (T(U).style === 'follow_the_leader') {
          if (prevs.every((p) => kind(p) === 'founding')) { const eu = ftlEntry(U); keyed = founding.map((s) => [eu.members.indexOf(s.m), s]); }
        } else keyed = founding.map((s, i) => [prevs[i].row.slot, s]);
        if (keyed) source = { kind: 'inherit', fromTransitionId: U };
      }
      if (!keyed) source = { kind: 'slot', fallback: true };
    }
    if (!keyed) keyed = founding.map((s) => [s.row.slot, s]);
    keyed.sort((a, b) => a[0] - b[0] || a[1].m - b[1].m);
    const members = keyed.map(([, s]) => s.m);
    const origins = keyed.map(([, s]) => origin(s));
    const path = destPath(db.shapes[t.dest]);
    const wps = t.params?.waypoints ?? [];
    const trail = makeTrail(origins, wps, path);
    const n = t.slots, m = members.length;
    const startDist = origins.map((_, q) => trail.cum[q]);
    const endDist = origins.map((_, q) => trail.destOffset + paramT(path.closed, n - m + q, n) * path.L);
    const pts = destinationsOf(t, db.shapes);
    const target = new Map(members.map((mm, q) => [mm, pts[n - m + q]]));
    db.assignments.filter((r) => r.transition === tid && !target.has(r.marcher))
      .sort((a, b) => a.slot - b.slot || a.marcher - b.marcher)
      .forEach((r, k) => target.set(r.marcher, pts[n - m - 1 - k]));
    return { members, source, trail, startDist, endDist, target };
  }

  return {
    spans, kind, ftlEntry, evalSpan,
    positionAt(m, b) { return evalSpan(spans(m).find((s) => s.start <= b && b < s.end), b); },
  };
}
