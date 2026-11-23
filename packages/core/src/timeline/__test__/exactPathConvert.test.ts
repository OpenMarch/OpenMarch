/**
 * The exact-path converter (spec EP-C, QA-EP-6 and QA-EP-8): every exact path, played as EP-R
 * says, against the resolver's `positionAt` at every tick of its move.
 *
 * A larger random run is opt-in:
 *
 *     EXACT_PATH_SHOWS=3000 pnpm --dir packages/core exec vitest run src/timeline/__test__/exactPathConvert.test.ts
 */
import { describe, expect, it } from "vitest";
import { checkExactPath, exactPlayer, TICKS_PER_BEAT } from "../exactPath";
import {
    EXACT_DEFAULT_TOLERANCE,
    exactPathsOf,
    type ExactMove,
} from "../exactPathConvert";
import { createResolver } from "../resolver";
import type {
    AssignmentRow,
    Resolver,
    RouteGeometry,
    TimelineSnapshot,
    TransitionRow,
    XY,
} from "../types";
import { walkedPathShow } from "./walkedPathShows";

const SHOWS = Number(process.env.EXACT_PATH_SHOWS ?? 300);
const TOL = EXACT_DEFAULT_TOLERANCE;
const d2 = (a: XY, b: XY) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** The worst gap between an exact path and the resolver, at every tick (or every `step`). */
export function worstGapOf(
    move: ExactMove,
    resolver: Resolver,
    step = 1,
): number {
    const player = exactPlayer(move.path);
    const last = move.path.keys[move.path.keys.length - 1]!.tick;
    let worst = 0;
    for (let tick = 0; tick <= last; tick += step) {
        const beat = Math.min(move.end, move.start + tick / TICKS_PER_BEAT);
        worst = Math.max(
            worst,
            d2(player.pointAt(tick), resolver.positionAt(move.marcherId, beat)),
        );
    }
    return worst;
}

const move = (
    id: number,
    start: number,
    end: number,
    points: XY[],
    extra: Partial<TransitionRow> = {},
): TransitionRow => ({
    id,
    start,
    end,
    dest: null,
    points,
    slots: points.length,
    style: "direct",
    order: "slot",
    params: null,
    ...extra,
});

let nextRow = 1;
const row = (
    marcher: number,
    t: TransitionRow,
    slot = 0,
    extra: Partial<AssignmentRow> = {},
): AssignmentRow => ({
    id: nextRow++,
    marcher,
    transition: t.id,
    slot,
    start: t.start,
    end: t.end,
    layer: 0,
    ...extra,
});

const show = (
    homes: XY[],
    transitions: TransitionRow[],
    assignments: AssignmentRow[],
    extra: Partial<TimelineSnapshot> = {},
): TimelineSnapshot => ({
    marchers: homes.map((home, i) => ({ id: i + 1, home })),
    shapes: {},
    transitions: Object.fromEntries(transitions.map((t) => [t.id, t])),
    assignments,
    ...extra,
});

const route = (from: XY, to: XY, points: RouteGeometry["points"]) => ({
    geometry: { v: 1 as const, from, to, points },
});

function convert(host: TimelineSnapshot) {
    const resolver = createResolver(host);
    const moves = exactPathsOf(host, resolver);
    for (const m of moves) expect(checkExactPath(m.path)).toEqual([]);
    return { resolver, moves };
}

describe("exact-path converter (EP-C)", () => {
    it("QA-EP-6: a direct move is one straight piece with two keys", () => {
        const t = move(1, 0, 8, [[160, 0]]);
        const { resolver, moves } = convert(show([[0, 0]], [t], [row(1, t)]));
        expect(moves).toHaveLength(1);
        const [m] = moves;
        expect(m!.path.shapes).toEqual([
            { kind: "points", points: [[160, 0]] },
        ]);
        expect(m!.path.keys).toEqual([
            { tick: 0, u: 0 },
            { tick: 3840, u: 1 },
        ]);
        expect(worstGapOf(m!, resolver)).toBeLessThan(1e-9);
    });

    it("QA-EP-6: an arc move is arcs; a corner path needs no key at its corners", () => {
        const arc = move(1, 0, 8, [[160, 0]], {
            style: "arc",
            params: { bulge: 0.4 },
        });
        const r1 = convert(show([[0, 0]], [arc], [row(1, arc)]));
        expect(r1.moves[0]!.path.shapes.every((s) => s.kind === "arc")).toBe(
            true,
        );
        expect(r1.moves[0]!.path.keys).toHaveLength(2);
        expect(worstGapOf(r1.moves[0]!, r1.resolver)).toBeLessThan(1e-6);

        const t = move(1, 0, 16, [[200, 0]]);
        const host = show([[0, 0]], [t], [row(1, t)], {
            routes: { 1: route([0, 0], [200, 0], [{ id: "a", at: [80, 90] }]) },
            lanes: { 1: { transition: 1, slot: 0, route: 1, offset: null } },
        });
        const r2 = convert(host);
        expect(r2.moves[0]!.path.shapes).toEqual([
            {
                kind: "points",
                points: [
                    [80, 90],
                    [200, 0],
                ],
            },
        ]);
        // walked at one speed, so the corner needs no key
        expect(r2.moves[0]!.path.keys).toHaveLength(2);
        expect(worstGapOf(r2.moves[0]!, r2.resolver)).toBeLessThan(1e-6);
    });

    it("QA-EP-6: smooth points become cubics timed by true length within the tolerance", () => {
        const t = move(1, 0, 16, [[200, 0]]);
        const host = show([[0, 0]], [t], [row(1, t)], {
            routes: {
                1: route(
                    [0, 0],
                    [200, 0],
                    [
                        { id: "a", at: [50, 60], tension: 1 },
                        { id: "b", at: [120, -40], tension: 1.5 },
                        { id: "c", at: [160, 20] },
                    ],
                ),
            },
            lanes: { 1: { transition: 1, slot: 0, route: 1, offset: null } },
        });
        const { resolver, moves } = convert(host);
        expect(moves[0]!.path.shapes.map((s) => s.kind)).toEqual([
            "cubic",
            "cubic",
            "cubic",
            "points",
        ]);
        expect(worstGapOf(moves[0]!, resolver)).toBeLessThan(TOL);
    });

    it("QA-EP-6: follow the leader round a circle, and a move cut short by a higher layer", () => {
        const ftl: TransitionRow = {
            id: 1,
            start: 0,
            end: 16,
            dest: 1,
            slots: 3,
            style: "follow_the_leader",
            order: "slot",
            params: { waypoints: [[80, 60]] },
        };
        const circle = show(
            [
                [0, 0],
                [20, 0],
                [40, 0],
            ],
            [ftl],
            [row(1, ftl, 0), row(2, ftl, 1), row(3, ftl, 2)],
            {
                shapes: {
                    1: {
                        kind: "circle",
                        geometry: {
                            center: [200, 100],
                            radius: 40,
                            start_angle: Math.PI,
                            clockwise: true,
                        },
                    },
                },
            },
        );
        const r1 = convert(circle);
        expect(r1.moves).toHaveLength(3);
        for (const m of r1.moves)
            expect(worstGapOf(m, r1.resolver)).toBeLessThan(TOL);

        const low = move(1, 0, 16, [[160, 0]], {
            style: "arc",
            params: { bulge: 0.25 },
        });
        const high = move(2, 6, 12, [[50, 90]]);
        const host = show(
            [[0, 0]],
            [low, high],
            [row(1, low), row(1, high, 0, { layer: 1, start: 8 })],
        );
        const r2 = convert(host);
        // the arc to beat 8, the higher move, then the resume
        expect(r2.moves.map((m) => [m.transitionId, m.start, m.end])).toEqual([
            [1, 0, 8],
            [2, 8, 12],
            [1, 12, 16],
        ]);
        for (const m of r2.moves)
            expect(worstGapOf(m, r2.resolver)).toBeLessThan(TOL);
    });

    it("QA-EP-6: standing still has no exact path", () => {
        const t = move(1, 0, 8, [[5, 5]]);
        const { moves } = convert(show([[5, 5]], [t], [row(1, t)]));
        expect(moves).toEqual([]);
    });

    it(`QA-EP-8: ${SHOWS} random shows agree with the resolver at every tick`, () => {
        let shows = 0;
        let paths = 0;
        let keys = 0;
        let worst = 0;
        let worstAt = "";
        for (let seed = 1; seed <= SHOWS; seed++) {
            const host = walkedPathShow(seed, 1800);
            let resolver: Resolver;
            try {
                resolver = createResolver(host);
                resolver.warmAll();
            } catch {
                continue;
            }
            shows++;
            const moves = exactPathsOf(host, resolver);
            for (const m of moves) {
                const problems = checkExactPath(m.path);
                if (problems.length)
                    throw new Error(
                        `seed ${seed} marcher ${m.marcherId} beat ${m.start}: ${problems[0]!.rule} ${problems[0]!.message}`,
                    );
                paths++;
                keys += m.path.keys.length;
                const gap = worstGapOf(m, resolver, 3);
                if (gap > worst) {
                    worst = gap;
                    worstAt = `seed ${seed} marcher ${m.marcherId} beats ${m.start}–${m.end}`;
                }
            }
        }
        // eslint-disable-next-line no-console -- the run's numbers, for the ADR's verification
        console.info(
            `QA-EP-8: ${shows} shows, ${paths} exact paths, ${(keys / Math.max(1, paths)).toFixed(1)} keys each, worst gap ${worst.toFixed(4)} (${worstAt})`,
        );
        expect(shows).toBeGreaterThan(SHOWS / 2);
        expect(worst, worstAt).toBeLessThan(TOL);
    }, 120_000);
});
