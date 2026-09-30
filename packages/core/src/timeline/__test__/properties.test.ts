// cspell:ignore lerp
/**
 * Property tests QA-P (spec 12.5) against the reference oracle, ported from
 * `docs/timeline/ref/props.mjs`: P-1, P-2, P-5, P-6, P-7 (approximate and
 * bit-exact), P-9, P-11, P-12 and P-13, plus the R-8 cross-check of the arc
 * formula against the centre-and-radius form. P-3 and P-4 need the cached
 * resolver (Phase 2); P-8 and P-10 have no dedicated assertion (spec 12.5).
 *
 * Expected values come from `./independentGeometry`, which shares no code
 * with `../geom`. The only model geometry imported here is the subject of a
 * check: `arcPoint` for the R-8 cross-check, and `destinationsOf` for the
 * bit-exact half of P-7 (spec 8.10: arrival equals the model's own sample
 * point, with no interpolation residue).
 *
 * Shows come from `./showGenerators`: ordinary shows, boundary-valued shows
 * (coordinates, radii, bulges and beats at their bounds) and adversarial arc
 * chains, with individually placed destinations (D-16) mixed in. fast-check
 * draws the show seeds with a fixed `seed`, so every run is deterministic, and
 * a failure reports the show seed (the same seed builds the same show in
 * props.mjs).
 *
 * Size. The default run checks DEFAULT_SHOWS ordinary shows, as many
 * boundary-valued shows, and one adversarial chain per ten shows (at least
 * three). A larger run is opt-in:
 *
 *     TIMELINE_PROPS_SHOWS=2000 pnpm --dir packages/core exec vitest run src/timeline/__test__/properties.test.ts
 *
 * `TIMELINE_PROPS_SEED=<n>` changes the fast-check seed, to explore shows the
 * default run never builds. Drop `--silent` (the package `test` script adds
 * it) to see the per-property check counts.
 */
import fc from "fast-check";
import { afterAll, describe, expect, it } from "vitest";
import { createTimelineOracleForTesting } from "../index";
import { arcPoint, destinationsOf } from "../geom";
import type { Oracle } from "../oracle";
import type { TimelineSnapshot, XY } from "../types";
import {
    arcCentreForm,
    betaOf,
    d2,
    distToPoly,
    distToShape,
    exactSamples,
} from "./independentGeometry";
import { chainWorld, makeWorld, type World } from "./showGenerators";

const DEFAULT_SHOWS = 300;
const SHOWS = Number(process.env.TIMELINE_PROPS_SHOWS ?? DEFAULT_SHOWS);
const FC_SEED = Number(process.env.TIMELINE_PROPS_SEED ?? 20260930);
const CHAINS = Math.max(3, Math.ceil(SHOWS / 10));
const ARC_CROSS_CHECKS = Math.max(20000, SHOWS * 20);
/** Generous per-test timeout that scales with the opt-in size. */
const TIMEOUT = 30_000 + SHOWS * 100;

const oracle = (db: TimelineSnapshot): Oracle =>
    createTimelineOracleForTesting(db);

// ---------------------------------------------------------------------------
// Tally: every check counts; a failed check throws, so fast-check reports it.
// ---------------------------------------------------------------------------

const counts = new Map<string, number>();
function check(prop: string, ok: boolean, why: () => string): void {
    counts.set(prop, (counts.get(prop) ?? 0) + 1);
    if (!ok) throw new Error(`${prop}: ${why()}`);
}
const total = () => [...counts.values()].reduce((a, b) => a + b, 0);
/** How many P-7 arrivals were at individually placed destinations (D-16). */
let individualArrivals = 0;

const finite = (p: XY) => Number.isFinite(p[0]) && Number.isFinite(p[1]);
const fmt = (p: XY) => `(${p.map((v) => +v.toPrecision(10)).join(", ")})`;

function shuffle<T>(xs: T[], R: () => number): T[] {
    for (let i = xs.length - 1; i > 0; i--) {
        const j = Math.floor(R() * (i + 1));
        [xs[i], xs[j]] = [xs[j]!, xs[i]!];
    }
    return xs;
}

// ---------------------------------------------------------------------------
// The per-show checks (props.mjs, one seed and mode)
// ---------------------------------------------------------------------------

function checkShow({ db, S, R }: World, chain: boolean): void {
    const o = oracle(db);
    const beta = betaOf(db);
    // a: the number of arc spans in the show (spec 8.11)
    const A = db.marchers.reduce(
        (a, m) =>
            a +
            o
                .spans(m.id)
                .filter(
                    (s) =>
                        s.row &&
                        db.transitions[s.row.transition]!.style === "arc",
                ).length,
        0,
    );
    // spec 12.1: 1e-9 * S + 1e-12
    const eps = 1e-9 * Math.max(1, S) + 1e-12;
    const bound = beta * Math.sqrt(1 + A) * (1 + 1e-12) + 1e-9;

    for (const m of db.marchers) {
        const spans = o.spans(m.id);
        for (const s of spans) {
            const probes = [s.start, s.end, (s.start + s.end) / 2].filter(
                Number.isFinite,
            );
            for (const b of probes.length ? probes : [0]) {
                const x = o.evalSpan(s, Math.min(b, s.end));
                check("P-11 finite", finite(x), () => `M${m.id}@${b} -> ${x}`);
                const r = Math.hypot(x[0], x[1]);
                check(
                    "P-13 derived range",
                    r <= bound,
                    () =>
                        `M${m.id}@${b}: |P| = ${r.toExponential(3)} > β√(1+a) = ${(beta * Math.sqrt(1 + A)).toExponential(3)}`,
                );
            }

            // P-1 continuity at the span's start
            if (s.k > 0 && Number.isFinite(s.start)) {
                const a = o.evalSpan(spans[s.k - 1]!, s.start);
                const b = o.evalSpan(s, s.start);
                check(
                    "P-1 continuity",
                    d2(a, b) <= eps,
                    () => `M${m.id}@${s.start}: ${fmt(a)} vs ${fmt(b)}`,
                );
            }

            // P-9 holds are constant
            if (!s.row && Number.isFinite(s.start)) {
                const a = o.evalSpan(s, s.start);
                const b = o.evalSpan(
                    s,
                    Number.isFinite(s.end)
                        ? (s.start + s.end) / 2
                        : s.start + 1e6,
                );
                check(
                    "P-9 hold",
                    a[0] === b[0] && a[1] === b[1],
                    () => `M${m.id}@${s.start}: ${fmt(a)} vs ${fmt(b)}`,
                );
            }

            if (!s.row) continue;
            const t = db.transitions[s.row.transition]!;

            // P-7 arrival, against independently computed destinations
            if (s.end === t.end) {
                const pts =
                    t.dest == null
                        ? t.points!.slice(0, t.slots)
                        : exactSamples(db.shapes[t.dest]!, t.slots);
                let idx: number;
                if (t.style !== "follow_the_leader") idx = s.row.slot;
                else {
                    const e = o.ftlEntry(t.id);
                    const n = t.slots;
                    const mm = e.members.length;
                    const q = e.members.indexOf(m.id);
                    if (q >= 0) idx = n - mm + q;
                    else {
                        const others = db.assignments
                            .filter(
                                (r) =>
                                    r.transition === t.id &&
                                    !e.members.includes(r.marcher),
                            )
                            .sort(
                                (a, b) =>
                                    a.slot - b.slot || a.marcher - b.marcher,
                            );
                        idx =
                            n -
                            mm -
                            1 -
                            others.findIndex((r) => r.marcher === m.id);
                    }
                }
                const want = pts[idx]!;
                const got = o.evalSpan(s, t.end);
                const where = () =>
                    `M${m.id} T${t.id} (${t.style}, ${t.dest == null ? "individual" : db.shapes[t.dest]!.kind})`;
                check(
                    "P-7 arrival",
                    d2(got, want) <= eps,
                    () => `${where()}: ${fmt(got)} vs exact ${fmt(want)}`,
                );
                if (t.dest == null) individualArrivals++;
                // 8.10: arrival is bit-exact, identical to the model's own sample point
                const own = destinationsOf(t, db.shapes)[idx]!;
                check(
                    "P-7 bit-exact arrival",
                    got[0] === own[0] && got[1] === own[1],
                    () => `${where()}: ${fmt(got)} vs ${fmt(own)}`,
                );
            }

            // P-6 trail adherence during founding FTL spans
            if (t.style === "follow_the_leader" && s.start === t.start) {
                const e = o.ftlEntry(t.id);
                const pre: XY[] = [
                    ...e.members.map((mm) =>
                        o.evalSpan(
                            o
                                .spans(mm)
                                .find(
                                    (x) =>
                                        x.row &&
                                        x.row.transition === t.id &&
                                        x.start === t.start,
                                )!,
                            t.start,
                        ),
                    ),
                    ...(t.params?.waypoints ?? []),
                ];
                const shape = db.shapes[t.dest!]!;
                const entrance = exactSamples(shape, 1)[0]!;
                for (const f of [0, 0.25, 0.5, 0.75, 1]) {
                    const b = s.start + f * (s.end - s.start);
                    const p = o.evalSpan(s, b);
                    const dist = Math.min(
                        distToShape(p, shape),
                        distToPoly(p, [...pre, entrance]),
                    );
                    check(
                        "P-6 trail",
                        dist <= eps,
                        () =>
                            `M${m.id} T${t.id}@${b}: ${dist.toExponential(2)} off the trail`,
                    );
                }
            }
        }
    }

    if (chain) {
        const last = Object.values(db.transitions).at(-1)!;
        const got = o.positionAt(1, last.end);
        check(
            "P-7 arrival",
            got[0] === 1 && got[1] === 1,
            () => `chain: final direct move arrived at ${fmt(got)}, not (1, 1)`,
        );
    }

    // P-5 and P-11 on FTL entries
    for (const t of Object.values(db.transitions)) {
        if (t.style !== "follow_the_leader") continue;
        const e = o.ftlEntry(t.id);
        const all = [
            ...e.startDist,
            ...e.endDist,
            ...e.targets.flatMap(([, xy]) => [xy[0], xy[1]]),
        ];
        check(
            "P-11 finite",
            all.every(Number.isFinite),
            () => `entry T${t.id}`,
        );
        // d_q(b) = lerp(startDist[q], endDist[q], p) with one p for every member,
        // so these three conditions are P-5 at every beat.
        let mono = true;
        for (let q = 0; q < e.members.length; q++) {
            if (
                q > 0 &&
                (e.startDist[q]! < e.startDist[q - 1]! ||
                    e.endDist[q]! < e.endDist[q - 1]!)
            )
                mono = false;
            if (e.endDist[q]! < e.startDist[q]!) mono = false;
        }
        check("P-5 no overtaking", mono, () => `T${t.id}`);
    }

    // P-12 causality: removing one assignment of T changes no position before T starts
    for (let trial = 0; trial < 3 && db.assignments.length; trial++) {
        const r = db.assignments[Math.floor(R() * db.assignments.length)]!;
        const t = db.transitions[r.transition]!;
        const o2 = oracle({
            ...db,
            assignments: db.assignments.filter((x) => x !== r),
        });
        let where = "";
        for (const m of db.marchers)
            for (const s of o.spans(m.id))
                for (const b of [s.start, (s.start + s.end) / 2])
                    if (
                        Number.isFinite(b) &&
                        b < t.start &&
                        !(
                            d2(o.positionAt(m.id, b), o2.positionAt(m.id, b)) <=
                            eps
                        )
                    )
                        where = `M${m.id}@${b}`;
        check(
            "P-12 causality",
            where === "",
            () =>
                `removing row ${r.id} (T${t.id} starts ${t.start}) changed ${where}`,
        );
    }

    // P-2 determinism: shuffle rows and renumber row ids
    {
        const perm = shuffle(
            db.assignments.map((r) => ({ ...r })),
            R,
        );
        const ids = shuffle(
            perm.map((_, i) => 10000 + i),
            R,
        );
        perm.forEach((r, i) => {
            r.id = ids[i]!;
        });
        const o2 = oracle({ ...db, assignments: perm });
        let why = "";
        for (const m of db.marchers)
            for (const b of Object.values(db.transitions).flatMap((t) => [
                t.start,
                (t.start + t.end) / 2,
                t.end,
            ]))
                if (
                    !(
                        d2(o.positionAt(m.id, b), o2.positionAt(m.id, b)) <=
                        1e-12 * Math.max(1, S)
                    )
                )
                    why = `M${m.id}@${b} moved`;
        for (const t of Object.values(db.transitions))
            if (
                t.style === "follow_the_leader" &&
                JSON.stringify(o.ftlEntry(t.id).members) !==
                    JSON.stringify(o2.ftlEntry(t.id).members)
            )
                why = `T${t.id} members changed`;
        check("P-2 determinism", why === "", () => why);
    }
}

const showSeed = fc.integer({ min: 1, max: 2 ** 31 - 1 });
const runs = (numRuns: number, offset: number): fc.Parameters<[number]> => ({
    seed: FC_SEED + offset,
    numRuns,
});

describe("timeline properties (spec 12.5) against the oracle", () => {
    afterAll(() => {
        const lines = [...counts.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `  ${k}: ${v}`);
        // eslint-disable-next-line no-console -- the per-property check counts (hidden by --silent)
        console.info(
            `timeline properties: ${SHOWS} ordinary, ${SHOWS} boundary-valued, ${CHAINS} chain shows; ${total()} checks (${individualArrivals} arrivals at D-16 destinations)\n${lines.join("\n")}`,
        );
    });

    it(
        "hold on ordinary shows",
        () => {
            fc.assert(
                fc.property(showSeed, (seed) =>
                    checkShow(makeWorld(seed, false), false),
                ),
                runs(SHOWS, 0),
            );
        },
        TIMEOUT,
    );

    it(
        "hold on boundary-valued shows",
        () => {
            fc.assert(
                fc.property(showSeed, (seed) =>
                    checkShow(makeWorld(seed, true), false),
                ),
                runs(SHOWS, 1),
            );
        },
        TIMEOUT,
    );

    it(
        "hold on adversarial arc chains",
        () => {
            fc.assert(
                fc.property(showSeed, (seed) =>
                    checkShow(chainWorld(seed), true),
                ),
                runs(CHAINS, 2),
            );
        },
        TIMEOUT,
    );

    it(
        "R-8: the chord-form arc matches the centre-and-radius form at moderate inputs",
        () => {
            const coord = fc.double({
                min: -1000,
                max: 1000,
                noNaN: true,
                noDefaultInfinity: true,
            });
            const point = fc.tuple(coord, coord);
            // The centre form loses precision as |k| -> 0 (its centre runs off to
            // infinity), so it is only a valid reference away from there.
            const bulge = fc.oneof(
                fc.constant(0),
                fc.double({ min: 1e-4, max: 0.5, noNaN: true }),
                fc.double({ min: -0.5, max: -1e-4, noNaN: true }),
            );
            const progress = fc.double({ min: 0, max: 1, noNaN: true });
            fc.assert(
                fc.property(point, point, bulge, progress, (A, B, k, p) => {
                    fc.pre(d2(A, B) >= 1e-3);
                    const a = arcPoint(A, B, k, p);
                    const b = arcCentreForm(A, B, k, p);
                    check(
                        "R-8 cross-check",
                        d2(a, b) <= 1e-7,
                        () =>
                            `${fmt(A)}→${fmt(B)} k=${k} p=${p}: ${fmt(a)} vs ${fmt(b)}`,
                    );
                }),
                { seed: FC_SEED + 3, numRuns: ARC_CROSS_CHECKS },
            );
        },
        TIMEOUT,
    );

    it("R-8: endpoints are exact and extreme finite inputs stay finite", () => {
        const cases: Array<[XY, XY, number]> = [
            [[0, 0], [8, 0], 0.5],
            [[0, 0], [1e6, 0], 1e-9],
            [[-1e6, -1e6], [1e6, 1e6], -0.5],
            [[0, 0], [8, 0], 1e200],
            [[0, 0], [Number.MIN_VALUE, 0], 0],
            [[0, 0], [Number.MIN_VALUE, 0], 0.5],
            [[1e6, 1e6], [1e6 + 1e-10, 1e6], 0.5],
        ];
        for (const [A, B, k] of cases) {
            const e0 = arcPoint(A, B, k, 0);
            const e1 = arcPoint(A, B, k, 1);
            const mid = arcPoint(A, B, k, 0.5);
            check(
                "R-8 endpoints/finite",
                e0 === A && e1 === B && finite(mid),
                () => `${fmt(A)}→${fmt(B)} k=${k}`,
            );
        }
    });

    it("exercised every property", () => {
        // Guards against a generator change that silently stops producing,
        // say, FTL entries or individual destinations.
        for (const prop of [
            "P-1 continuity",
            "P-2 determinism",
            "P-5 no overtaking",
            "P-6 trail",
            "P-7 arrival",
            "P-7 bit-exact arrival",
            "P-9 hold",
            "P-11 finite",
            "P-12 causality",
            "P-13 derived range",
            "R-8 cross-check",
            "R-8 endpoints/finite",
        ])
            expect(counts.get(prop) ?? 0, prop).toBeGreaterThan(0);
        expect(individualArrivals, "D-16 arrivals").toBeGreaterThan(0);
    });
});
