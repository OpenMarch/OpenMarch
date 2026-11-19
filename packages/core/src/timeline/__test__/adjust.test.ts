// cspell:ignore rehome rehomed
/**
 * Adjust, pathways step 3b (spec v0.10 R-14′ item 6, T-3, T-4, AP-H1, AP-R11, P-14b; decisions A
 * to C in Appendix J.8). Oracle and resolver read the same profile; the independent copy in
 * `docs/timeline/ref` has its own fixtures (QA-RT-L2, QA-RT-L5).
 */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
// @ts-expect-error: the spec's reference implementation is plain JavaScript
import { makeOracle } from "../../../../../docs/timeline/ref/oracle.mjs";
import {
    adjustAt,
    adjustRefusal,
    anchorOfPlace,
    createResolver,
    createTimelineOracleForTesting,
    EPS_GEOM,
    groupSchedule,
    limitRouteEdit,
    placeAdjustKey,
    refitGeometry,
    rehomeProfile,
    removeAdjustKey,
    resolveAdjust,
    routeEndsChanged,
    S_MIN,
    validateAdjustProfile,
    type AdjustKey,
    type AdjustProfile,
    type RouteGeometry,
    type TimelineSnapshot,
    type XY,
} from "../index";

const ROUTE: RouteGeometry = {
    v: 1,
    from: [0, 0],
    to: [200, 0],
    points: [
        { id: "p", at: [50, 0] },
        { id: "q", at: [150, 0] },
    ],
};
const schedule = (g: RouteGeometry = ROUTE) => groupSchedule(g);
const key = (a: string, b: string, f: number, d: XY): AdjustKey => ({
    a,
    b,
    f,
    d,
});
const profile = (...keys: AdjustKey[]): AdjustProfile => ({ v: 1, keys });

/** Two members on one transition, 16 counts; the second may carry an Adjust */
function show(
    adjust: AdjustProfile | null,
    geometry: RouteGeometry = ROUTE,
): TimelineSnapshot {
    return {
        marchers: [
            { id: 1, home: [geometry.from[0], geometry.from[1] - 5] },
            { id: 2, home: [geometry.from[0], geometry.from[1] + 5] },
        ],
        shapes: {},
        transitions: {
            1: {
                id: 1,
                start: 0,
                end: 16,
                dest: null,
                points: [
                    [geometry.to[0], geometry.to[1] - 5],
                    [geometry.to[0], geometry.to[1] + 5],
                ],
                slots: 2,
                style: "direct",
                order: "slot",
                params: null,
            },
        },
        assignments: [
            {
                id: 1,
                marcher: 1,
                transition: 1,
                slot: 0,
                start: 0,
                end: 16,
                layer: 0,
            },
            {
                id: 2,
                marcher: 2,
                transition: 1,
                slot: 1,
                start: 0,
                end: 16,
                layer: 0,
            },
        ],
        routes: { 1: { geometry } },
        lanes: {
            1: { transition: 1, slot: 0, route: 1, offset: [0, -5] },
            2: { transition: 1, slot: 1, route: 1, offset: [0, 5], adjust },
        },
    };
}

const expectAgree = (host: TimelineSnapshot) => {
    const r = createResolver(host);
    const o = createTimelineOracleForTesting(host);
    for (let b = 0; b <= 16; b += 0.125)
        for (const m of [1, 2])
            expect(r.positionAt(m, b), `M${m}@${b}`).toEqual(
                o.positionAt(m, b),
            );
    return r;
};

describe("R-14′ item 6: an Adjust on a lane (QA-RT-L2)", () => {
    const bulge = profile(
        key("p", "q", 0.25, [0, 0]),
        key("p", "q", 0.5, [0, 20]),
        key("p", "q", 0.75, [0, 0]),
    );

    it("displaces between its keys only; resolver and oracle agree bit for bit", () => {
        const r = expectAgree(show(bulge));
        // 200 long over 16 counts: x = 12.5 per count; the key at x = 100 is count 8
        expect(r.positionAt(2, 8)).toEqual([100, 25]);
        expect(r.positionAt(2, 6)).toEqual([75, 5]); // the zero key
        expect(r.positionAt(2, 7)).toEqual([87.5, 15]); // halfway up the ramp
        expect(r.positionAt(2, 4)).toEqual([50, 5]); // the kept point, on its lane
        expect(r.positionAt(1, 8)).toEqual([100, -5]); // the other lane is untouched
    });

    it("no Adjust: bit-identical to a lane with none, and an adjust field of null is none", () => {
        const a = createResolver(show(null));
        const host = show(null);
        delete host.lanes![2]!.adjust;
        const b = createResolver(host);
        for (let x = 0; x <= 16; x += 0.25)
            expect(a.positionAt(2, x)).toEqual(b.positionAt(2, x));
    });

    it("a key on the first kept point moves the first leg's end, and it stays continuous", () => {
        const host = show(
            profile(key("p", "q", 0, [0, 20]), key("p", "q", 0.4, [0, 0])),
        );
        const r = expectAgree(host);
        expect(r.positionAt(2, 4)).toEqual([50, 25]);
        for (let b = 3.5; b <= 4.5; b += 0.01) {
            const a = r.positionAt(2, b);
            const c = r.positionAt(2, b + 0.01);
            expect(Math.hypot(c[0] - a[0], c[1] - a[1])).toBeLessThan(0.5);
        }
    });

    it("ignores it on a route with no kept point (T-11)", () => {
        const g = { ...ROUTE, points: [] };
        const r = createResolver(
            show(profile(key("from", "to", 0.5, [0, 20])), g),
        );
        expect(r.positionAt(2, 8)).toEqual([100, 5]);
        expect(r.diagnostics()).toEqual([]);
    });

    it("the handles of a smooth first point carry the displacement", () => {
        const smooth: RouteGeometry = {
            v: 1,
            from: [0, 0],
            to: [200, 0],
            points: [
                { id: "p", at: [50, 30], tension: 1 },
                { id: "q", at: [150, 30], tension: 1 },
            ],
        };
        const plain = createResolver(show(null, smooth));
        const moved = createResolver(
            show(profile(key("p", "q", 0, [7, 11])), smooth),
        );
        // A constant Adjust carries the whole lane, handles and all, to first and last legs' ends
        const uFirst = groupSchedule(smooth).uFirst;
        const b = uFirst * 16;
        const a0 = plain.positionAt(2, b);
        const a1 = moved.positionAt(2, b);
        expect(a1[0] - a0[0]).toBeCloseTo(7, 9);
        expect(a1[1] - a0[1]).toBeCloseTo(11, 9);
    });
});

describe("T-1 to T-4 and the diagnostics (QA-RT-L5)", () => {
    const codes = (host: TimelineSnapshot) => {
        const r = createResolver(host);
        const o = createTimelineOracleForTesting(host);
        const sorted = (l: { code: string }[]) => l.map((d) => d.code).sort();
        expect(sorted(r.diagnostics())).toEqual(sorted(o.diagnostics()));
        return sorted(r.diagnostics());
    };

    it("T-3 clamps a key on a leg into [D_1, D_m]", () => {
        const host = show(profile(key("from", "p", 0.5, [0, 20])));
        expect(codes(host)).toEqual(["D-ADJUST-CLAMP"]);
        const r = expectAgree(host);
        expect(r.positionAt(2, 4)).toEqual([50, 25]);
    });

    it("T-4 is a single-linkage scan, keeping the last stored key of a cluster", () => {
        const g = schedule();
        const eps = 0.6 * EPS_GEOM;
        // Three keys in a chain, each 0.6 ε from the next: one cluster, though the outer two are
        // 1.2 ε apart; the middle one is last in stored order
        const p = profile(
            key("from", "to", (100 + 0 * eps) / 200, [0, 1]),
            key("from", "to", (100 + 2 * eps) / 200, [0, 2]),
            key("from", "to", (100 + eps) / 200, [0, 3]),
        );
        const resolved = resolveAdjust(g, ROUTE.points, p);
        // Rounding in f can merge or split neighbours by an ulp, so compare at a scale it can't
        expect(resolved.xs.length).toBe(1);
        expect(resolved.ds[0]).toEqual([0, 3]);
        expect(resolved.ties).toBe(2);
        expect(codes(show(p))).toEqual(["D-ADJUST-TIE"]);
    });

    it("keys tied exactly and 1e-12 apart stay continuous", () => {
        const host = show(
            profile(
                key("p", "q", 0.5, [0, 10]),
                key("p", "q", 0.5, [0, 20]),
                key("p", "q", 0.5 + 1e-14, [0, 30]),
                key("p", "q", 0.8, [0, 0]),
            ),
        );
        const r = expectAgree(host);
        expect(r.positionAt(2, 8)).toEqual([100, 35]);
    });

    it("T-1: an anchor on a missing id reads as from and to, with D-ANCHOR; T-2 reversed ends too", () => {
        const a = show(profile(key("gone", "q", 0.5, [0, 20])));
        expect(codes(a)).toEqual(["D-ANCHOR"]);
        expectAgree(a);
        const b = show(profile(key("q", "p", 0.5, [0, 20])));
        expect(codes(b)).toEqual(["D-ANCHOR"]);
        expectAgree(b);
    });

    it("the resolver's notify drops a lane's cached Adjust when it changes", () => {
        const host = show(profile(key("p", "q", 0.5, [0, 10])));
        const r = createResolver(host);
        expect(r.positionAt(2, 8)).toEqual([100, 15]);
        const was = host.lanes![2]!;
        const now = { ...was, adjust: profile(key("p", "q", 0.5, [0, 40])) };
        host.lanes![2] = now;
        r.notify({
            changes: [
                {
                    table: "lanes",
                    rowId: 2,
                    before: { id: 2, ...was },
                    after: { id: 2, ...now },
                },
            ],
        });
        expect(r.positionAt(2, 8)).toEqual([100, 45]);
        expect(r.checkCacheClosure()).toBe(true);
    });
});

describe("the independent ref/ oracle", () => {
    type Ref = { positionAt(m: number, b: number): XY };
    const compare = (host: TimelineSnapshot) => {
        const r = createResolver(host);
        const ref = makeOracle(host) as Ref;
        for (let b = 0; b <= 16; b += 0.0625)
            for (const m of [1, 2])
                expect(r.positionAt(m, b), `M${m}@${b}`).toEqual(
                    ref.positionAt(m, b),
                );
    };

    it("agrees bit for bit on random profiles, write checks or not, corners and curves", () => {
        const curve: RouteGeometry = {
            v: 1,
            from: [0, 0],
            to: [200, 30],
            points: [
                { id: "p", at: [50, 20], tension: 1 },
                { id: "m", at: [100, -20], tension: 0.5 },
                { id: "q", at: [150, 10] },
            ],
        };
        const ids = ["from", "p", "m", "q", "to", "gone"];
        fc.assert(
            fc.property(
                fc.array(
                    fc.record({
                        a: fc.constantFrom(...ids),
                        b: fc.constantFrom(...ids),
                        f: fc.double({ min: 0, max: 1, noNaN: true }),
                        dx: fc.double({ min: -40, max: 40, noNaN: true }),
                        dy: fc.double({ min: -40, max: 40, noNaN: true }),
                    }),
                    { minLength: 1, maxLength: 7 },
                ),
                fc.boolean(),
                (raw, curved) => {
                    const g = curved
                        ? curve
                        : {
                              ...curve,
                              points: curve.points.map((p) => ({
                                  id: p.id,
                                  at: p.at,
                              })),
                          };
                    compare(
                        show(
                            profile(
                                ...raw.map((k) =>
                                    key(k.a, k.b, k.f, [k.dx, k.dy]),
                                ),
                            ),
                            g,
                        ),
                    );
                },
            ),
            { numRuns: 60 },
        );
    });
});

describe("AP-R11: placing a key", () => {
    const place = (p: AdjustProfile | null, x: number, d: XY, g = ROUTE) =>
        placeAdjustKey({
            schedule: schedule(g),
            points: g.points,
            profile: p,
            x,
            d,
        });

    it("writes zero keys at the stretch's ends so the bulge stays local", () => {
        const out = place(null, 100, [0, 20]);
        expect(out.ok && out.profile?.keys).toEqual([
            { a: "p", b: "q", f: 0, d: [0, 0] },
            { a: "p", b: "q", f: 0.5, d: [0, 20] },
            { a: "q", b: "to", f: 0, d: [0, 0] },
        ]);
    });

    it("near a stretch's end the zero key is s_min away, past the corner, clamped", () => {
        const g: RouteGeometry = {
            ...ROUTE,
            points: [
                { id: "p", at: [50, 0] },
                { id: "m", at: [100, 0] },
                { id: "q", at: [150, 0] },
            ],
        };
        const out = place(null, 105, [0, 20], g);
        if (!out.ok || !out.profile) throw new Error("refused");
        const s = schedule(g);
        const places = out.profile.keys.map(
            (k) => resolveAdjust(s, g.points, profile(k)).xs[0]!,
        );
        expect(places[1]).toBeCloseTo(105, 9);
        expect(105 - places[0]!).toBeCloseTo(S_MIN, 5);
        expect(105 - places[0]!).toBeGreaterThanOrEqual(S_MIN);
        expect(places[2]).toBeCloseTo(150, 9); // the far end of its own stretch
    });

    it("within s_min of a key it edits that key", () => {
        const first = place(null, 100, [0, 20]);
        if (!first.ok) throw new Error("refused");
        const out = place(first.profile, 105, [3, 4]);
        expect(out.ok && out.profile?.keys.length).toBe(3);
        expect(out.ok && out.profile?.keys[1]!.d).toEqual([3, 4]);
    });

    it("within s_min of an end of the rigid part the key goes on the end", () => {
        const out = place(null, 55, [0, 20]);
        expect(out.ok && out.profile?.keys.map((k) => [k.a, k.b, k.f])).toEqual(
            [
                ["p", "q", 0],
                ["q", "to", 0],
            ],
        );
    });

    it("refuses a place off the rigid part, and a rigid part shorter than 2·s_min", () => {
        expect(place(null, 20, [0, 20])).toEqual({
            ok: false,
            reason: "outside",
        });
        const short: RouteGeometry = {
            ...ROUTE,
            points: [
                { id: "p", at: [50, 0] },
                { id: "q", at: [70, 0] },
            ],
        };
        expect(place(null, 60, [0, 20], short)).toEqual({
            ok: false,
            reason: "tooShort",
        });
    });

    it("a zero key that would land within s_min of another key isn't written", () => {
        const g: RouteGeometry = {
            ...ROUTE,
            points: [
                { id: "p", at: [50, 0] },
                { id: "m", at: [100, 0] },
                { id: "q", at: [150, 0] },
            ],
        };
        // A key just before the corner m, the new key just after it
        const existing = profile(key("p", "m", 0.9, [0, 5]));
        const out = place(existing, 113, [0, 20], g);
        if (!out.ok || !out.profile) throw new Error("refused");
        const s = schedule(g);
        expect(adjustRefusal(s, g.points, out.profile.keys)).toBeNull();
        expect(out.profile.keys.length).toBe(3); // old, new and the right-hand zero key
    });

    it("keys are refused outside the rigid part or closer than s_min (I-J4)", () => {
        const s = schedule();
        expect(
            adjustRefusal(s, ROUTE.points, [key("from", "p", 0.5, [1, 1])]),
        ).toBe("outside");
        expect(
            adjustRefusal(s, ROUTE.points, [
                key("p", "q", 0.5, [1, 1]),
                key("p", "q", 0.55, [1, 1]),
            ]),
        ).toBe("tooClose");
        expect(
            adjustRefusal(s, ROUTE.points, [
                key("p", "q", 0.5, [1, 1]),
                key("p", "q", 0.5 + S_MIN / 100, [1, 1]),
            ]),
        ).toBeNull();
    });

    it("removing a key leaves no stranded zero keys; a reset profile is null", () => {
        const first = place(null, 100, [0, 20]);
        if (!first.ok || !first.profile) throw new Error("refused");
        expect(removeAdjustKey(first.profile, 1)).toBeNull();
    });

    it("anchorOfPlace names the kept stretch; validateAdjustProfile checks J.2", () => {
        expect(anchorOfPlace(schedule(), ROUTE.points, 150)).toEqual({
            a: "q",
            b: "to",
            f: 0,
        });
        expect(validateAdjustProfile({ v: 1, keys: [] }).ok).toBe(false);
        expect(
            validateAdjustProfile(profile(key("p", "q", 2, [0, 0]))).ok,
        ).toBe(false);
        expect(
            validateAdjustProfile(profile(key("p", "q", 0.5, [0, 0]))).ok,
        ).toBe(true);
    });
});

describe("AP-H1 re-home (QA-AP-L3)", () => {
    const three: RouteGeometry = {
        v: 1,
        from: [0, 0],
        to: [400, 0],
        points: [
            { id: "p", at: [100, 0] },
            { id: "m", at: [200, 0] },
            { id: "q", at: [300, 0] },
        ],
    };
    const without = (g: RouteGeometry, id: string): RouteGeometry => ({
        ...g,
        points: g.points.filter((p) => p.id !== id),
    });
    const placeOf = (g: RouteGeometry, k: AdjustKey) =>
        resolveAdjust(groupSchedule(g), g.points, profile(k)).xs[0]!;

    it("leaves a key on surviving points alone, with no badge, even as a drag moves its place", () => {
        const p = profile(key("p", "m", 0.5, [0, 10]));
        const dragged: RouteGeometry = {
            ...three,
            points: three.points.map((q) =>
                q.id === "m" ? { ...q, at: [260, 40] } : q,
            ),
        };
        const out = rehomeProfile(three, dragged, p);
        expect(out).toEqual({ profile: p, changed: false, dropped: 0 });
    });

    it("re-homes a key on a deleted point by fraction between the survivors", () => {
        const p = profile(key("p", "m", 0.5, [0, 10]));
        const out = rehomeProfile(three, without(three, "m"), p);
        expect(out.profile).toEqual({
            v: 1,
            keys: [{ a: "p", b: "q", f: 0.25, d: [0, 10] }],
            rehomed: true,
        });
        expect(placeOf(three, p.keys[0]!)).toBe(150);
        expect(placeOf(without(three, "m"), out.profile!.keys[0]!)).toBe(150);
        expect(out.dropped).toBe(0);
    });

    it("deleting both anchors re-homes to the nearest survivors around the old place", () => {
        const four: RouteGeometry = {
            ...three,
            points: [...three.points, { id: "s", at: [350, 0] }],
        };
        const p = profile(key("m", "q", 0.5, [0, 10])); // x = 250
        const g = without(without(four, "m"), "q");
        const out = rehomeProfile(four, g, p);
        expect(out.profile?.keys).toEqual([
            { a: "p", b: "s", f: 150 / 250, d: [0, 10] },
        ]);
        expect(placeOf(g, out.profile!.keys[0]!)).toBe(250);
    });

    it("with one kept point left every key sits on it, and only one stays", () => {
        const p = profile(
            key("m", "q", 0.2, [0, 10]),
            key("m", "q", 0.8, [0, 20]),
        );
        const out = rehomeProfile(
            three,
            { ...three, points: [three.points[0]!] },
            p,
        );
        expect(out.profile?.keys).toEqual([
            { a: "p", b: "to", f: 0, d: [0, 20] },
        ]);
        expect(out.dropped).toBe(1);
    });

    it("a redraw gives ('from', 'to', x_old / L_old), clamped into the new rigid part", () => {
        const p = profile(key("p", "m", 0.5, [0, 10]));
        const redrawn: RouteGeometry = {
            v: 1,
            from: [0, 0],
            to: [400, 0],
            points: [
                { id: "u", at: [40, 0] },
                { id: "v", at: [380, 0] },
            ],
        };
        const out = rehomeProfile(three, redrawn, p);
        expect(out.profile?.keys[0]).toEqual({
            a: "from",
            b: "to",
            f: 150 / 400,
            d: [0, 10],
        });
    });

    it("deleting the first kept point clamps a key that fell on the new first leg", () => {
        const p = profile(key("p", "m", 0.1, [0, 10]));
        const out = rehomeProfile(three, without(three, "p"), p);
        expect(out.profile?.keys[0]).toEqual({
            a: "m",
            b: "q",
            f: 0,
            d: [0, 10],
        });
    });

    it("drops the re-homed key, never the survivor, when a delete crowds them", () => {
        const p = profile(
            key("p", "q", 0.5, [0, 7]), // x = 200, survives
            key("m", "q", 0.03, [0, 10]), // x = 203, re-homed within s_min of it
        );
        const out = rehomeProfile(three, without(three, "m"), p);
        expect(out.dropped).toBe(1);
        expect(out.profile?.keys).toEqual([
            { a: "p", b: "q", f: 0.5, d: [0, 7] },
        ]);
        expect(out.profile?.rehomed).toBe(true);
    });

    it("decision B: a stretch that crowds two surviving keys drops the earlier stored, badged", () => {
        const keys = profile(
            key("p", "m", 0.5, [0, 7]),
            key("m", "q", 0.5, [0, 9]),
        );
        const crushed: RouteGeometry = {
            ...three,
            points: [
                { id: "p", at: [100, 0] },
                { id: "m", at: [105, 0] },
                { id: "q", at: [110, 0] },
            ],
        };
        const out = rehomeProfile(three, crushed, keys);
        expect(out.dropped).toBe(1);
        expect(out.profile?.keys).toEqual([keys.keys[1]]);
        expect(out.profile?.rehomed).toBe(true);
    });

    it("no kept point left: the whole profile goes", () => {
        const out = rehomeProfile(
            three,
            { ...three, points: [] },
            profile(key("p", "m", 0.5, [0, 10])),
        );
        expect(out).toEqual({ profile: null, changed: true, dropped: 1 });
    });

    it("a zero key squeezed against a displacing key steps back a step; the displacing key stays", () => {
        const p = profile(
            key("p", "q", 0.5, [0, 0]), // x = 200, survives
            key("m", "q", 0.03, [0, 10]), // x = 203, re-homed within s_min of it
        );
        const g = without(three, "m");
        const out = rehomeProfile(three, g, p);
        expect(out.dropped).toBe(0);
        expect(out.profile?.rehomed).toBe(true);
        const keys = out.profile!.keys;
        expect(keys.map((k) => k.d)).toEqual([
            [0, 0],
            [0, 10],
        ]);
        expect(placeOf(g, keys[1]!)).toBeCloseTo(203, 6);
        expect(
            placeOf(g, keys[1]!) - placeOf(g, keys[0]!),
        ).toBeGreaterThanOrEqual(S_MIN);
        expect(placeOf(g, keys[1]!) - placeOf(g, keys[0]!)).toBeCloseTo(
            S_MIN,
            4,
        );
    });

    it("a bend squeezed hard keeps its peak, its ends a step either side", () => {
        const bend = profile(
            key("p", "m", 0.5, [0, 0]), // 150
            key("m", "q", 0, [0, 30]), // 200
            key("m", "q", 0.5, [0, 0]), // 250
        );
        // p to q squeezed from 200 long to 30: the keys land 7.5 apart
        const squeezed: RouteGeometry = {
            ...three,
            points: [
                { id: "p", at: [100, 0] },
                { id: "m", at: [115, 0] },
                { id: "q", at: [130, 0] },
            ],
        };
        const out = rehomeProfile(three, squeezed, bend);
        expect(out.dropped).toBe(0);
        const keys = out.profile!.keys;
        expect(keys.map((k) => k.d)).toEqual([
            [0, 0],
            [0, 30],
            [0, 0],
        ]);
        const xs = keys.map((k) => placeOf(squeezed, k));
        expect(xs[1]).toBeCloseTo(115, 6);
        expect(xs[1]! - xs[0]!).toBeCloseTo(S_MIN, 4);
        expect(xs[2]! - xs[1]!).toBeCloseTo(S_MIN, 4);
        expect(validateAdjustProfile(out.profile!).ok).toBe(true);
    });

    it("with no room for an end a step away, the end goes and the peak stays", () => {
        const bend = profile(
            key("p", "m", 0.5, [0, 0]),
            key("m", "q", 0, [0, 30]),
            key("m", "q", 0.5, [0, 0]),
        );
        // The rigid part is 12 long: a step either side of the peak falls outside it
        const tight: RouteGeometry = {
            ...three,
            points: [
                { id: "p", at: [100, 0] },
                { id: "m", at: [106, 0] },
                { id: "q", at: [112, 0] },
            ],
        };
        const out = rehomeProfile(three, tight, bend);
        expect(out.dropped).toBe(2);
        expect(out.profile?.keys).toEqual([bend.keys[1]]);
        expect(out.profile?.rehomed).toBe(true);
    });

    it("zero keys squeezed with no displacing key among them clear the profile", () => {
        const p = profile(
            key("p", "m", 0.5, [0, 0]),
            key("m", "q", 0.5, [0, 0]),
        );
        const out = rehomeProfile(three, without(three, "m"), p);
        expect(out.profile).toBeNull();
        expect(out.changed).toBe(true);
    });
});

describe("AP-R11: point drags stop short", () => {
    const g: RouteGeometry = {
        v: 1,
        from: [0, 0],
        to: [400, 0],
        points: [
            { id: "p", at: [100, 0] },
            { id: "q", at: [200, 0] },
            { id: "r", at: [300, 0] },
        ],
    };
    // 20 apart on p..q
    const keys = profile(
        key("p", "q", 0.4, [0, 5]),
        key("p", "q", 0.6, [0, 0]),
    );
    const moveQ = (at: XY): RouteGeometry => ({
        ...g,
        points: g.points.map((p) => (p.id === "q" ? { ...p, at } : p)),
    });

    it("stops at s_min, along its way", () => {
        const out = limitRouteEdit(g, moveQ([110, 0]), [keys]);
        expect(out.stopped).toBe(true);
        const qAt = out.geometry.points[1]!.at;
        expect(qAt[1]).toBeCloseTo(0, 9);
        // The keys are 0.2 of the leg apart: the leg stops at s_min / 0.2
        expect(qAt[0] - 100).toBeCloseTo(S_MIN / 0.2, 2);
        expect(qAt[0] - 100).toBeGreaterThanOrEqual(S_MIN / 0.2);
    });

    it("leaves a drag that fits, and one with no profile", () => {
        const next = moveQ([250, 30]);
        expect(limitRouteEdit(g, next, [keys])).toEqual({
            geometry: next,
            stopped: false,
        });
        expect(limitRouteEdit(g, moveQ([101, 0]), []).stopped).toBe(false);
    });

    it("never squeezes a pair already tighter than s_min any further", () => {
        const tight = profile(
            key("p", "q", 0.4, [0, 5]),
            key("p", "q", 0.45, [0, 0]),
        );
        const out = limitRouteEdit(g, moveQ([120, 0]), [tight]);
        expect(out.stopped).toBe(true);
        expect(out.geometry.points[1]!.at[0]).toBeCloseTo(200, 3);
    });
});

describe("Re-fit (decision A)", () => {
    const g: RouteGeometry = {
        v: 1,
        from: [0, 0],
        to: [100, 0],
        points: [
            { id: "p", at: [25, 10], tension: 1 },
            { id: "q", at: [75, 10] },
        ],
    };

    it("equal end changes are exactly a translation", () => {
        const out = refitGeometry(g, [7.5, -3], [107.5, -3]);
        expect(out).toEqual({
            v: 1,
            from: [7.5, -3],
            to: [107.5, -3],
            points: [
                { id: "p", at: [32.5, 7], tension: 1 },
                { id: "q", at: [82.5, 7] },
            ],
        });
    });

    it("unequal ends move each point by its along-path fraction, ids kept", () => {
        const straight: RouteGeometry = {
            v: 1,
            from: [0, 0],
            to: [100, 0],
            points: [
                { id: "p", at: [25, 0] },
                { id: "q", at: [75, 0] },
            ],
        };
        const out = refitGeometry(straight, [0, 0], [100, 40]);
        expect(out.points.map((p) => p.id)).toEqual(["p", "q"]);
        expect(out.points[0]!.at).toEqual([25, 10]);
        expect(out.points[1]!.at).toEqual([75, 30]);
    });

    it("the first and last tangents read the new ends", () => {
        const before = groupSchedule(g);
        const after = groupSchedule(refitGeometry(g, [0, -50], [100, 0]));
        const c = (s: typeof before) => {
            const piece = s.W.pieces[1]!;
            return piece.kind === "cubic" ? piece.c1 : null;
        };
        expect(c(after)).not.toEqual(c(before));
    });

    it("routeEndsChanged is the app's geometry tolerance", () => {
        const ends = { from: [0, 0] as XY, to: [10, 0] as XY };
        expect(routeEndsChanged(ends, ends)).toBe(false);
        expect(routeEndsChanged(ends, { ...ends, to: [10 + 1e-12, 0] })).toBe(
            false,
        );
        expect(routeEndsChanged(ends, { ...ends, to: [10.001, 0] })).toBe(true);
    });

    it("a profile re-fit by a stretch keeps surviving anchors and passes AP-H1", () => {
        const keys = profile(
            key("p", "q", 0.3, [0, 5]),
            key("p", "q", 0.7, [0, 0]),
        );
        const next = refitGeometry(g, [0, 0], [200, 0]);
        expect(rehomeProfile(g, next, keys)).toEqual({
            profile: keys,
            changed: false,
            dropped: 0,
        });
    });
});

describe("QA-P-14b: bounded speed", () => {
    /** The P-14b bound at reference speed v over one lane with a profile */
    const check = (host: TimelineSnapshot, resolved: AdjustProfile) => {
        const g = host.routes![1]!.geometry;
        const sch = groupSchedule(g);
        const v = sch.W.L / 16;
        const r = resolveAdjust(sch, g.points, resolved);
        const maxStep = r.ds.reduce(
            (m, d, i) =>
                i === 0
                    ? m
                    : Math.max(
                          m,
                          Math.hypot(
                              d[0] - r.ds[i - 1]![0],
                              d[1] - r.ds[i - 1]![1],
                          ),
                      ),
            0,
        );
        const bound = v * (1 + maxStep / S_MIN);
        const res = createResolver(host);
        const m = sch.W.V.length - 2;
        const lo = (sch.W.D[1]! / sch.W.L) * 16;
        const hi = (sch.W.D[m]! / sch.W.L) * 16;
        const h = (hi - lo) / 4096;
        let worst = 0;
        for (let i = 0; i < 4096; i++) {
            const a = res.positionAt(2, lo + i * h);
            const b = res.positionAt(2, lo + (i + 1) * h);
            worst = Math.max(worst, Math.hypot(b[0] - a[0], b[1] - a[1]) / h);
        }
        return { worst, bound };
    };
    const line = (n: number): RouteGeometry => ({
        v: 1,
        from: [0, 0],
        to: [n, 0],
        points: [
            { id: "p", at: [10, 0] },
            { id: "q", at: [n - 10, 0] },
        ],
    });

    it("every show that passes the write checks is within the bound", () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 100, max: 400 }),
                fc.array(
                    fc.tuple(
                        fc.double({ min: 0, max: 1, noNaN: true }),
                        fc.double({ min: -30, max: 30, noNaN: true }),
                    ),
                    { minLength: 1, maxLength: 6 },
                ),
                (n, raw) => {
                    const g = line(n);
                    const span = n - 20;
                    const ks: AdjustKey[] = [];
                    let last = -Infinity;
                    for (const [f, dy] of [...raw].sort((a, b) => a[0] - b[0]))
                        if ((f - last) * span >= S_MIN) {
                            ks.push(key("p", "q", f, [0, dy]));
                            last = f;
                        }
                    const p = profile(...ks);
                    expect(
                        adjustRefusal(groupSchedule(g), g.points, p.keys),
                    ).toBeNull();
                    const { worst, bound } = check(show(p, g), p);
                    expect(worst).toBeLessThanOrEqual(bound * (1 + 1e-6));
                },
            ),
            { numRuns: 80 },
        );
    });

    it("negative run: keys ε apart (write checks off) fail the bound", () => {
        const g = line(200);
        const p = profile(
            key("p", "q", 0.5, [0, 0]),
            key("p", "q", 0.5 + 5 * EPS_GEOM, [0, 15]),
        );
        expect(adjustRefusal(groupSchedule(g), g.points, p.keys)).toBe(
            "tooClose",
        );
        // Sampled across the bulge itself, the bound's step is far too large to see it, so probe
        // the ramp at the same scale the keys are apart
        const res = createResolver(show(p, g));
        const lo = 8 - 1e-7;
        const hi = 8 + 1e-7;
        let worst = 0;
        const h = (hi - lo) / 2000;
        for (let i = 0; i < 2000; i++) {
            const a = res.positionAt(2, lo + i * h);
            const b = res.positionAt(2, lo + (i + 1) * h);
            worst = Math.max(worst, Math.hypot(b[0] - a[0], b[1] - a[1]) / h);
        }
        const v = groupSchedule(g).W.L / 16;
        expect(worst).toBeGreaterThan(v * (1 + 15 / S_MIN) * 10);
    });

    it("adjustAt evaluates a key exactly and is constant beyond the ends", () => {
        const r = resolveAdjust(
            schedule(),
            ROUTE.points,
            profile(key("p", "q", 0.25, [1, 2]), key("p", "q", 0.5, [3, 4])),
        );
        expect(adjustAt(r, 0)).toEqual([1, 2]);
        expect(adjustAt(r, 75)).toEqual([1, 2]);
        expect(adjustAt(r, 100)).toEqual([3, 4]);
        expect(adjustAt(r, 500)).toEqual([3, 4]);
    });
});
