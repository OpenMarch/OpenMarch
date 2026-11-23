// Reference oracle: uncached, spec-literal implementation of §8. Deliberately naive.
// db shape: { marchers:[{id,home:[x,y]}], shapes:{id:{kind,geometry}},
//             transitions:{id:{id,start,end,dest,slots,style,order,params}},
//             assignments:[{id,marcher,transition,slot,start,end,layer}] }
import { lerp, clamp01, destPath, paramT, destinationsOf, arcPoint, flatten, makeTrail, makeRouteTrail, makeAlongWay, alongWayEnds, alongWayAt, ftlDest, routeWalk, groupWalk } from './geom.mjs';

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
      if (e.ends) return alongWayAt(e.trail, e.startDist[q], e.endDist[q], e.ends.turn[q], e.ends.straight[q], e.target.get(sp.m), p);   // R-13″
      return e.trail.at(e.startDist[q] + (e.endDist[q] - e.startDist[q]) * p);
    }
    const p = clamp01((b - sp.start) / (t.end - sp.start));                            // R-5
    const o = origin(sp);
    if (t.style === 'follow_the_leader') return lerp(o, ftlEntry(t.id).target.get(sp.m), p); // R-11
    const dst = destinationsOf(t, db.shapes)[sp.row.slot];
    const lane = Object.values(db.lanes ?? {}).find((l) => l.transition === t.id && l.slot === sp.row.slot);
    if (lane) {                                                                        // R-14′ (v0.10): lane first, whatever the style
      const g = db.routes[lane.route].geometry;                                        // founding walks the route,
      return kind(sp) === 'founding' ? (lane.offset ? groupWalk(o, g.points, dst, g.from, g.to, lane.offset, lane.adjust ?? null, g.toBulge).at(p) : routeWalk(o, g.points, dst, g.from, g.to, g.toBulge).at(p)) : lerp(o, dst, p); // joins and resumes walk straight (step 24)
    }
    return t.style === 'arc' ? arcPoint(o, dst, t.params?.bulge ?? 0, p) : lerp(o, dst, p); // R-8 / R-7
  }

  function prevNonHold(sp) { const s = spans(sp.m); for (let j = sp.k - 1; j >= 0; j--) if (s[j].row) return s[j]; return null; }

  function ftlEntry(tid) { if (!eMemo.has(tid)) eMemo.set(tid, ftlEntryRaw(tid)); return eMemo.get(tid); }
  function ftlEntryRaw(tid) { // R-9, R-12
    const t = T(tid);
    const founding = db.marchers.map((mm) => spans(mm.id).find((s) => s.row && s.row.transition === tid && s.start === t.start)).filter(Boolean);
    let keyed = null, source = { kind: 'slot', fallback: false };
    if (t.order === 'inherit' && t.dest != null && founding.length) {              // R-13′: with no shape the order is the slots'
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
    const sign = t.params?.reverse === true ? -1 : 1;                                   // R-12′ (step 4): Reverse turns the order around
    keyed.sort((a, b) => sign * (a[0] - b[0]) || a[1].m - b[1].m);
    const members = keyed.map(([, s]) => s.m);
    const origins = keyed.map(([, s]) => origin(s));
    const n = t.slots, m = members.length, pts = destinationsOf(t, db.shapes);
    const dest = ftlDest(t.dest == null ? null : destPath(db.shapes[t.dest]), pts, n, sign < 0);   // R-13′, R-12′ (step 4)
    const path = dest.walked, wps = t.params?.waypoints ?? [];
    const tr = t.route == null ? null : db.routes?.[t.route]?.geometry;                 // R-9′ (step 4): a trail route's drawn part; waypoints not read (T-15)
    const along = t.dest == null && t.params?.ends === 'along';                         // R-13″ (step 4b): ends along the way
    const trail = along ? makeAlongWay(origins, tr) : tr ? makeRouteTrail(origins, tr, path) : makeTrail(origins, wps, path);
    const startDist = origins.map((_, q) => trail.cum[q]);
    const pointOf = keyed.map(([, sp], q) => dest.member(q, m, sp.row.slot));           // R-9's sample, or the row's own slot (R-13′)
    const ends = along ? alongWayEnds(trail, pointOf.map((j) => pts[j]), startDist) : null;
    const endDist = ends ? ends.endDist : origins.map((_, q) => trail.destOffset + dest.along(pointOf[q]));
    const target = new Map(members.map((mm, q) => [mm, pts[pointOf[q]]]));
    db.assignments.filter((r) => r.transition === tid && !target.has(r.marcher))
      .sort((a, b) => a.slot - b.slot || a.marcher - b.marcher)
      .forEach((r, k) => target.set(r.marcher, pts[dest.other(k, m, r.slot)]));
    return { members, source, trail, startDist, endDist, target, ends };
  }

  return {
    spans, kind, ftlEntry, evalSpan,
    positionAt(m, b) { return evalSpan(spans(m).find((s) => s.start <= b && b < s.end), b); },
  };
}
