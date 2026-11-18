/**
 * QA-WP-15 (spec 12.11): the drawable walked path against the resolver over random shows at field
 * scale (coordinates 0 to 1800). The walked path is derived from the resolver's rules, so when a
 * rule changes (a new trail, a new kind of lane walk) and `walkedPath` is not taught it, this
 * fails with the show seed, the marcher and the beat.
 *
 * For every marcher of every show, over the whole show and a few random and page-like ranges:
 *
 * - `walkedPathPointAt` is within `WALKED_SAMPLE_TOLERANCE` of `positionAt` (R-20 item 7), and
 *   within `EXACT` on lines, arcs and cubics;
 * - segments are in beat order, inside the range, finite, and join end to start;
 * - an empty path means the marcher never moves in the range;
 * - the SVG path data, parsed back (arcs by the W3C endpoint-to-centre conversion), stays within
 *   the tolerance of the resolver, so rounding to 3 decimals never moves a curve (item 8);
 * - the polyline form stays within twice the tolerance (item 9);
 * - a batch (`createWalkedPaths`) gives the same paths as the plain functions.
 *
 * A larger run is opt-in:
 *
 *     WALKED_PATH_SHOWS=3000 pnpm --dir packages/core exec vitest run src/timeline/__test__/walkedPathProperties.test.ts
 */
import { describe, expect, it } from "vitest";
import { createResolver } from "../resolver";
import type { Resolver, TimelineSnapshot, XY } from "../types";
import {
    WALKED_SAMPLE_TOLERANCE,
    createWalkedPaths,
    walkedPath,
    walkedPathOfMove,
    walkedPathPointAt,
    walkedPathToPolylines,
    walkedPathToSvg,
    type WalkedPath,
} from "../walkedPath";
import { mulberry32, walkedPathShow } from "./walkedPathShows";

const SHOWS = Number(process.env.WALKED_PATH_SHOWS ?? 300);
const FIELD = 1800;
const TOL = WALKED_SAMPLE_TOLERANCE;
/** Lines, arcs and cubics agree far inside the tolerance: only polylines use it. */
const EXACT = 1e-3;
/** Seeds the review of step 18 found over the tolerance; always run. */
const REVIEW_SEEDS = [1, 46, 221, 353, 606, 1061];

const d2 = (a: XY, b: XY) => Math.hypot(a[0] - b[0], a[1] - b[1]);

type Command =
    | { k: "L"; from: XY; to: XY }
    | { k: "C"; from: XY; c1: XY; c2: XY; to: XY }
    | { k: "A"; from: XY; r: number; large: number; sweep: number; to: XY };

/** Absolute `M`, `L`, `C` and circular `A` commands, as `walkedPathToSvg` writes them. */
function parseSvg(d: string): Command[] {
    const tokens = d.trim() === "" ? [] : d.trim().split(/\s+/);
    const out: Command[] = [];
    let i = 0;
    let at: XY = [0, 0];
    const num = () => {
        const token = tokens[i++]!;
        if (!/^-?\d+(\.\d+)?$/.test(token))
            throw new Error(`"${token}" is not a plain number`);
        return Number(token);
    };
    const flag = () => {
        const token = tokens[i++]!;
        if (token !== "0" && token !== "1")
            throw new Error(`"${token}" is not a flag`);
        return Number(token);
    };
    while (i < tokens.length) {
        const cmd = tokens[i++];
        if (cmd === "M") at = [num(), num()];
        else if (cmd === "L") {
            const to: XY = [num(), num()];
            out.push({ k: "L", from: at, to });
            at = to;
        } else if (cmd === "C") {
            const c1: XY = [num(), num()];
            const c2: XY = [num(), num()];
            const to: XY = [num(), num()];
            out.push({ k: "C", from: at, c1, c2, to });
            at = to;
        } else if (cmd === "A") {
            const rx = num();
            const ry = num();
            const rotation = num();
            if (rx !== ry || rotation !== 0) throw new Error("not circular");
            const large = flag();
            const sweep = flag();
            const to: XY = [num(), num()];
            out.push({ k: "A", from: at, r: rx, large, sweep, to });
            at = to;
        } else throw new Error(`unknown command ${cmd}`);
    }
    return out;
}

/**
 * The point at fraction `f` of an SVG arc, by the endpoint-to-centre conversion of the SVG
 * implementation notes (W3C SVG 1.1 F.6.5 and F.6.6), for `rx = ry` and no rotation.
 */
function svgArcPoint(arc: Extract<Command, { k: "A" }>, f: number): XY {
    const [x1, y1] = arc.from;
    const [x2, y2] = arc.to;
    let r = arc.r;
    if (r === 0 || (x1 === x2 && y1 === y2))
        return [x1 + (x2 - x1) * f, y1 + (y2 - y1) * f];
    const dx = (x1 - x2) / 2;
    const dy = (y1 - y2) / 2;
    // F.6.6: a radius too small for the chord is scaled up to fit it
    const lambda = (dx * dx + dy * dy) / (r * r);
    if (lambda > 1) r *= Math.sqrt(lambda);
    const sign = arc.large !== arc.sweep ? 1 : -1;
    const co =
        sign *
        Math.sqrt(
            Math.max(0, r * r * r * r - r * r * dy * dy - r * r * dx * dx) /
                (r * r * dy * dy + r * r * dx * dx),
        );
    const cx = co * dy + (x1 + x2) / 2;
    const cy = -co * dx + (y1 + y2) / 2;
    const a1 = Math.atan2(y1 - cy, x1 - cx);
    let da = Math.atan2(y2 - cy, x2 - cx) - a1;
    if (arc.sweep === 0 && da > 0) da -= 2 * Math.PI;
    if (arc.sweep === 1 && da < 0) da += 2 * Math.PI;
    const a = a1 + da * f;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function commandPoints(c: Command): XY[] {
    if (c.k === "L") return [c.from, c.to];
    const out: XY[] = [];
    const N = 200;
    for (let i = 0; i <= N; i++) {
        const f = i / N;
        if (c.k === "A") out.push(svgArcPoint(c, f));
        else {
            const u = 1 - f;
            out.push([
                u * u * u * c.from[0] +
                    3 * u * u * f * c.c1[0] +
                    3 * u * f * f * c.c2[0] +
                    f * f * f * c.to[0],
                u * u * u * c.from[1] +
                    3 * u * u * f * c.c1[1] +
                    3 * u * f * f * c.c2[1] +
                    f * f * f * c.to[1],
            ]);
        }
    }
    return out;
}

function distToPolyline(p: XY, pts: readonly XY[]): number {
    let best = Infinity;
    for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1]!;
        const b = pts[i]!;
        const vx = b[0] - a[0];
        const vy = b[1] - a[1];
        const L = vx * vx + vy * vy;
        const t =
            L === 0
                ? 0
                : Math.max(
                      0,
                      Math.min(
                          1,
                          ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L,
                      ),
                  );
        best = Math.min(
            best,
            Math.hypot(p[0] - a[0] - vx * t, p[1] - a[1] - vy * t),
        );
    }
    return best;
}

interface Worst {
    agree: number;
    exact: number;
    svg: number;
    polyline: number;
    shows: number;
    paths: number;
    kinds: Record<string, number>;
}

function checkPath(
    label: string,
    path: WalkedPath,
    resolver: Resolver,
    worst: Worst,
) {
    const { marcherId: m, from, to, segments } = path;
    const fail = (what: string): never => {
        throw new Error(`${label}: ${what}`);
    };
    worst.paths++;
    segments.forEach((s, i) => {
        worst.kinds[s.kind] = (worst.kinds[s.kind] ?? 0) + 1;
        JSON.stringify(s, (_, v) =>
            typeof v === "number" && !Number.isFinite(v)
                ? fail(`segment ${i} has a number that is not finite`)
                : v,
        );
        if (!(s.end > s.start)) fail(`segment ${i} takes no time`);
        if (s.start < from - 1e-9 || s.end > to + 1e-9)
            fail(`segment ${i} is outside the range`);
        if (s.kind === "arc" && Math.abs(s.sweep) > Math.PI / 2 + 1e-9)
            fail(`segment ${i} is an arc over a quarter turn`);
        if (i === 0) return;
        const prev = segments[i - 1]!;
        if (s.start < prev.end - 1e-9) fail(`segment ${i} overlaps the last`);
        // it starts where the last ended, unless the marcher moved in between (it can't: it holds)
        if (d2(prev.to, s.from) > 1e-6)
            fail(`segment ${i} starts ${d2(prev.to, s.from)} from the last`);
    });
    if (segments.length === 0) {
        const start = resolver.positionAt(m, from);
        for (let i = 1; i <= 40; i++)
            if (
                d2(
                    start,
                    resolver.positionAt(m, from + ((to - from) * i) / 40),
                ) > 1e-6
            )
                fail("the path is empty but the marcher moves");
        return;
    }
    // agreement, densely over the range and at each segment's ends and inside
    const beats = [from, to];
    for (let i = 1; i < 120; i++) beats.push(from + ((to - from) * i) / 120);
    for (const s of segments) {
        const w = s.end - s.start;
        beats.push(s.start, s.end, s.start + w * 1e-9, s.end - w * 1e-9);
        for (let i = 1; i < 12; i++) beats.push(s.start + (w * i) / 12);
    }
    for (const beat of beats) {
        if (beat < from || beat > to) continue;
        const err = d2(
            walkedPathPointAt(path, beat)!,
            resolver.positionAt(m, beat),
        );
        if (!Number.isFinite(err)) fail(`no point at beat ${beat}`);
        const seg = segments.find((s) => beat >= s.start && beat <= s.end);
        const exact = seg?.kind !== "polyline";
        if (exact) worst.exact = Math.max(worst.exact, err);
        worst.agree = Math.max(worst.agree, err);
        if (err > (exact ? EXACT : TOL))
            fail(
                `${err} from the resolver at beat ${beat} (${seg?.kind ?? "between segments"})`,
            );
    }
    // the SVG, parsed back: each segment's commands against the resolver on its beats
    const d = walkedPathToSvg(path);
    const commands = parseSvg(d);
    let next = 0;
    for (const s of segments) {
        const count = s.kind === "polyline" ? s.points.length - 1 : 1;
        const drawn = commands.slice(next, next + count).flatMap(commandPoints);
        next += count;
        for (let i = 0; i <= 16; i++) {
            const beat = s.start + ((s.end - s.start) * i) / 16;
            const off = distToPolyline(resolver.positionAt(m, beat), drawn);
            worst.svg = Math.max(worst.svg, off);
            if (off > TOL)
                fail(`the SVG ${s.kind} is ${off} from the resolver: ${d}`);
        }
    }
    if (next !== commands.length) fail("the SVG has commands of no segment");
    const runs = walkedPathToPolylines(path);
    for (const s of segments)
        for (let i = 0; i <= 16; i++) {
            const beat = s.start + ((s.end - s.start) * i) / 16;
            const p = resolver.positionAt(m, beat);
            const off = Math.min(...runs.map((run) => distToPolyline(p, run)));
            worst.polyline = Math.max(worst.polyline, off);
            if (off > 2 * TOL + 1e-6)
                fail(`the polyline form is ${off} from the resolver`);
        }
}

function checkShow(seed: number, worst: Worst) {
    const host: TimelineSnapshot = walkedPathShow(seed, FIELD);
    let resolver: Resolver;
    try {
        resolver = createResolver(host);
        resolver.warmAll();
    } catch {
        return; // a show the resolver itself rejects
    }
    worst.shows++;
    const transitions = Object.values(host.transitions);
    const edges = transitions.flatMap((t) => [t.start, t.end]);
    const lo = Math.min(...edges) - 2;
    const hi = Math.max(...edges) + 2;
    const R = mulberry32(seed);
    const batch = createWalkedPaths(host, resolver);
    for (const { id } of host.marchers) {
        const ranges: [number, number][] = [[lo, hi]];
        for (let i = 0; i < 3; i++) {
            const a = lo + R() * (hi - lo);
            const b = lo + R() * (hi - lo);
            if (Math.abs(a - b) > 1e-3)
                ranges.push([Math.min(a, b), Math.max(a, b)]);
        }
        for (let i = 0; i < 2; i++) {
            const a = Math.floor(lo + R() * (hi - lo));
            ranges.push([a, a + 1 + Math.floor(R() * 12)]);
        }
        for (const [from, to] of ranges) {
            const label = `show ${seed}, marcher ${id}, beats [${from}, ${to}]`;
            const path = walkedPath(host, resolver, id, from, to);
            checkPath(label, path, resolver, worst);
            if (
                JSON.stringify(batch.path(id, from, to)) !==
                JSON.stringify(path)
            )
                throw new Error(`${label}: the batch gives another path`);
        }
        for (const t of transitions) {
            const whole = walkedPath(host, resolver, id, t.start, t.end);
            const own = JSON.stringify(
                whole.segments.filter((s) => s.transitionId === t.id),
            );
            for (const ofMove of [
                walkedPathOfMove(host, resolver, id, t.id),
                batch.ofMove(id, t.id),
            ])
                if (JSON.stringify(ofMove.segments) !== own)
                    throw new Error(
                        `show ${seed}, marcher ${id}: move ${t.id} alone differs`,
                    );
        }
    }
}

describe("drawable walked paths against the resolver (QA-WP-15)", () => {
    it("the generator is deterministic per seed", () => {
        expect(walkedPathShow(7, FIELD)).toEqual(walkedPathShow(7, FIELD));
    });

    it(
        `${SHOWS} random shows at field scale: agreement, joins, SVG and polylines`,
        () => {
            const worst: Worst = {
                agree: 0,
                exact: 0,
                svg: 0,
                polyline: 0,
                shows: 0,
                paths: 0,
                kinds: {},
            };
            const seeds = new Set(REVIEW_SEEDS);
            for (let seed = 1; seeds.size < SHOWS + REVIEW_SEEDS.length; seed++)
                seeds.add(seed);
            for (const seed of seeds) checkShow(seed, worst);
            console.log("walked path property test", JSON.stringify(worst));
            // the run really walked every kind of segment
            expect(worst.shows).toBeGreaterThan(SHOWS / 2);
            for (const kind of ["line", "arc", "cubic", "polyline"])
                expect(worst.kinds[kind]).toBeGreaterThan(0);
            expect(worst.agree).toBeLessThanOrEqual(TOL);
            expect(worst.exact).toBeLessThanOrEqual(EXACT);
        },
        60_000 + SHOWS * 200,
    );
});
