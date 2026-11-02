import { fieldToFrame, frameToField, type ShapeFrame } from "../frame/frame";
import { formatSteps } from "../editor/format";
import { parseSteps } from "../editor/format";
import { scrubDistance, scrubValue } from "../editor/scrub";
import type { ToolKind } from "../tool/toolKind";
import {
    distributionFor,
    filesDistribution,
    storedDistribution,
    type Distribution,
} from "../distribute/distribution";
import { distribute, layoutLines } from "../distribute/distribute";
import { rectRegion } from "../distribute/region";
import type { ShapeKind, XY } from "../types";

/**
 * A small kind that exists only for tests (#345): a straight row with one gap, turned and flipped
 * through its frame. It goes through the same shape session as the box without any host code
 * knowing it, which shows the host doesn't depend on one kind.
 */
export interface RowParams {
    readonly center: XY;
    /** Field units between neighbors */
    readonly gap: number;
    readonly rotation: number;
    readonly flipX?: boolean;
    readonly flipY?: boolean;
}

function rowFrame(p: RowParams, n: number): ShapeFrame {
    return {
        center: p.center,
        halfWidth: ((n - 1) * p.gap) / 2,
        halfDepth: 0,
        rotation: p.rotation,
        flipX: p.flipX === true,
        flipY: p.flipY === true,
    };
}

function rowSpots(p: RowParams, n: number) {
    const frame = rowFrame(p, n);
    const side = p.flipX ? -1 : 1;
    return Array.from({ length: n }, (_, i) => ({
        ...frameToField(frame, {
            x: side * (i - (n - 1) / 2) * p.gap,
            y: 0,
        }),
        row: 0,
        col: i,
    }));
}

const rowShape: ShapeKind<RowParams> = {
    id: "test-row",
    version: 1,
    label: "Row",
    family: "path",
    groups: [],
    fit: () => ({ center: { x: 0, y: 0 }, gap: 10, rotation: 0 }),
    handles: () => [],
    drag: (p) => p,
    outline: (p, n) => [rowSpots(p, n).map(({ x, y }) => ({ x, y }))],
    generate: rowSpots,
    orderKey: (p, point, _ctx, n) => [fieldToFrame(rowFrame(p, n), point).x],
};

/** Field units between neighbors, never under half a step */
const gapOf = (steps: number, stepPx: number) =>
    Math.max(stepPx / 2, Math.round(steps * 2) * (stepPx / 2));

export const rowTool: ToolKind<RowParams> = {
    shape: rowShape,
    params: [
        {
            key: "gap",
            label: "Gap, in steps",
            unit: "steps",
            primary: true,
            drag: "x",
            interval: true,
            blends: true,
            default: 2,
            range: { min: 0.5 },
            glyph: "↔",
            display: (p, _n, stepPx) => formatSteps(p.gap / stepPx),
            value: (p, _n, stepPx) => p.gap / stepPx,
            type(p, _n, text, env) {
                const steps = parseSteps(text);
                return steps === null
                    ? null
                    : { ...p, gap: gapOf(steps, env.stepPx) };
            },
            scrub(base, _n, m, env) {
                const was = base.gap / env.stepPx;
                const steps = scrubValue(
                    was,
                    scrubDistance("x", m.dx, m.dy),
                    0,
                    {
                        axis: "x",
                        px: 8,
                        step: 0.5,
                    },
                );
                return steps === was
                    ? base
                    : { ...base, gap: gapOf(steps, env.stepPx) };
            },
            widen(p, _n, by, env) {
                const steps = p.gap / env.stepPx + by;
                return steps < 0.5 - 1e-9
                    ? null
                    : { ...p, gap: gapOf(steps, env.stepPx) };
            },
        },
    ],
    scaling: "interval",
    draw(from, to, n, env) {
        const length = Math.abs(to.x - from.x);
        if (length < env.stepPx / 2) return undefined;
        return {
            center: env.gridSnap({ x: (from.x + to.x) / 2, y: from.y }),
            gap: gapOf(length / Math.max(1, n - 1) / env.stepPx, env.stepPx),
            rotation: 0,
        };
    },
    handles: (p, n) => {
        const spots = rowSpots(p, n);
        return [
            { key: "start", at: spots[0]!, cursor: "ew-resize" },
            { key: "end", at: spots.at(-1)!, cursor: "ew-resize" },
        ];
    },
    dragHandle(base, n, _key, to, env) {
        const local = fieldToFrame(rowFrame(base, n), to);
        const half = Math.abs(local.x);
        return {
            ...base,
            gap: gapOf(
                (2 * half) / Math.max(1, n - 1) / env.stepPx,
                env.stepPx,
            ),
        };
    },
    contains(p, n, at) {
        const frame = rowFrame(p, n);
        const local = fieldToFrame(frame, at);
        return (
            Math.abs(local.x) <= frame.halfWidth + p.gap / 2 &&
            Math.abs(local.y) <= p.gap / 2
        );
    },
    move: (base, _n, delta, env) => ({
        ...base,
        center: env.gridSnap({
            x: base.center.x + delta.x,
            y: base.center.y + delta.y,
        }),
    }),
    frameOf: rowFrame,
    fromFrame: (frame, n, env) => ({
        center: frame.center,
        gap: gapOf(
            (2 * frame.halfWidth) / Math.max(1, n - 1) / env.stepPx,
            env.stepPx,
        ),
        rotation: frame.rotation,
        flipX: frame.flipX || undefined,
        flipY: frame.flipY || undefined,
    }),
    withFrame: (p, _n, frame) => ({
        ...p,
        center: frame.center,
        rotation: frame.rotation,
        flipX: frame.flipX || undefined,
        flipY: frame.flipY || undefined,
    }),
};

/**
 * A second test kind (#349) with no regular spacing: its spots spread along a length, so it
 * scales its footprint in half steps instead of an interval. The host scales it without knowing
 * which it is.
 */
export interface SpreadParams {
    readonly center: XY;
    /** Field units from the first spot to the last */
    readonly length: number;
    readonly rotation: number;
    readonly flipX?: boolean;
    readonly flipY?: boolean;
}

const asRow = (p: SpreadParams, n: number): RowParams => ({
    center: p.center,
    gap: p.length / Math.max(1, n - 1),
    rotation: p.rotation,
    flipX: p.flipX,
    flipY: p.flipY,
});

const spreadShape: ShapeKind<SpreadParams> = {
    ...(rowShape as unknown as ShapeKind<SpreadParams>),
    id: "test-spread",
    label: "Spread",
    fit: () => ({ center: { x: 0, y: 0 }, length: 50, rotation: 0 }),
    outline: (p, n, ctx) => rowShape.outline(asRow(p, n), n, ctx),
    generate: (p, n, ctx) => rowShape.generate(asRow(p, n), n, ctx),
    orderKey: (p, point, ctx, n) =>
        rowShape.orderKey(asRow(p, n), point, ctx, n),
};

export const spreadTool: ToolKind<SpreadParams> = {
    shape: spreadShape,
    params: [
        {
            key: "length",
            label: "Length, in steps",
            unit: "steps",
            primary: true,
            drag: "x",
            interval: false,
            blends: true,
            range: { min: 0.5 },
            display: (p, _n, stepPx) => formatSteps(p.length / stepPx),
            type(p, _n, text, env) {
                const steps = parseSteps(text);
                return steps === null
                    ? null
                    : { ...p, length: steps * env.stepPx };
            },
            scrub: (base) => base,
        },
    ],
    scaling: "footprint",
    draw(from, to, _n, env) {
        const length = Math.abs(to.x - from.x);
        if (length < env.stepPx / 2) return undefined;
        return {
            center: env.gridSnap({ x: (from.x + to.x) / 2, y: from.y }),
            length,
            rotation: 0,
        };
    },
    handles: (p, n) => rowTool.handles(asRow(p, n), n),
    dragHandle(base, n, _key, to) {
        const local = fieldToFrame(spreadFrame(base, n), to);
        return { ...base, length: 2 * Math.abs(local.x) };
    },
    contains: (p, n, at) => rowTool.contains(asRow(p, n), n, at),
    move: (base, _n, delta, env) => ({
        ...base,
        center: env.gridSnap({
            x: base.center.x + delta.x,
            y: base.center.y + delta.y,
        }),
    }),
    frameOf: (p, n) => spreadFrame(p, n),
    fromFrame: (frame) => ({
        center: frame.center,
        length: 2 * frame.halfWidth,
        rotation: frame.rotation,
        flipX: frame.flipX || undefined,
        flipY: frame.flipY || undefined,
    }),
    withFrame: (p, _n, frame) => ({
        ...p,
        center: frame.center,
        rotation: frame.rotation,
        flipX: frame.flipX || undefined,
        flipY: frame.flipY || undefined,
    }),
    withSize: (p, _n, half) => ({ ...p, length: 2 * half.halfWidth }),
};

function spreadFrame(p: SpreadParams, n: number): ShapeFrame {
    return rowFrame(asRow(p, n), n);
}

/**
 * A third test kind (#349, spec #344 story 36): a row whose neighbors have a gap list of their own
 * (4, 4, 2), so scaling by interval must change every gap of the list by half a step. Only its
 * gaps differ from the row; the host scales it without knowing that.
 */
export interface GapListParams {
    readonly center: XY;
    /** Field units between each pair of neighbors, n - 1 of them */
    readonly gaps: readonly number[];
    readonly rotation: number;
}

const gapListFrame = (p: GapListParams): ShapeFrame => ({
    center: p.center,
    halfWidth: p.gaps.reduce((sum, g) => sum + g, 0) / 2,
    halfDepth: 0,
    rotation: p.rotation,
    flipX: false,
    flipY: false,
});

function gapListSpots(p: GapListParams, n: number) {
    const frame = gapListFrame(p);
    let x = -frame.halfWidth;
    return Array.from({ length: n }, (_, i) => {
        if (i > 0) x += p.gaps[i - 1] ?? 0;
        return { ...frameToField(frame, { x, y: 0 }), row: 0, col: i };
    });
}

const gapListShape: ShapeKind<GapListParams> = {
    ...(rowShape as unknown as ShapeKind<GapListParams>),
    id: "test-gap-list",
    label: "Gap list",
    fit: () => ({ center: { x: 0, y: 0 }, gaps: [], rotation: 0 }),
    outline: (p, n) => [gapListSpots(p, n).map(({ x, y }) => ({ x, y }))],
    generate: gapListSpots,
    orderKey: (p, point) => [fieldToFrame(gapListFrame(p), point).x],
};

/** Field units on half steps, never under half a step */
const halfSteps = (steps: number, stepPx: number) =>
    Math.max(0.5, Math.round(steps * 2) / 2) * stepPx;

export const gapListTool: ToolKind<GapListParams> = {
    shape: gapListShape,
    params: [
        {
            key: "gaps",
            label: "Gaps, in steps",
            unit: "steps",
            primary: true,
            drag: "x",
            interval: true,
            blends: true,
            display: (p, _n, stepPx) =>
                p.gaps.map((g) => formatSteps(g / stepPx)).join(", "),
            type(p, n, text, env) {
                const steps = text.split(",").map((t) => parseSteps(t));
                if (steps.length !== n - 1 || steps.some((s) => s === null))
                    return null;
                return {
                    ...p,
                    gaps: steps.map((s) => halfSteps(s!, env.stepPx)),
                };
            },
            scrub: (base) => base,
            widen(p, _n, by, env) {
                const steps = p.gaps.map((g) => g / env.stepPx + by);
                if (steps.some((s) => s < 0.5 - 1e-9)) return null;
                return {
                    ...p,
                    gaps: steps.map((s) => halfSteps(s, env.stepPx)),
                };
            },
        },
    ],
    scaling: "interval",
    draw(from, to, n, env) {
        const length = Math.abs(to.x - from.x);
        if (length < env.stepPx / 2) return undefined;
        const gap = halfSteps(
            length / Math.max(1, n - 1) / env.stepPx,
            env.stepPx,
        );
        return {
            center: env.gridSnap({ x: (from.x + to.x) / 2, y: from.y }),
            gaps: Array.from({ length: Math.max(0, n - 1) }, () => gap),
            rotation: 0,
        };
    },
    handles: () => [],
    dragHandle: (base) => base,
    contains(p, _n, at) {
        const local = fieldToFrame(gapListFrame(p), at);
        return (
            Math.abs(local.x) <= gapListFrame(p).halfWidth + 5 &&
            Math.abs(local.y) <= 5
        );
    },
    move: (base, _n, delta, env) => ({
        ...base,
        center: env.gridSnap({
            x: base.center.x + delta.x,
            y: base.center.y + delta.y,
        }),
    }),
    frameOf: (p) => gapListFrame(p),
    fromFrame: (frame, n, env) => ({
        center: frame.center,
        gaps: Array.from({ length: Math.max(0, n - 1) }, () =>
            halfSteps(
                (2 * frame.halfWidth) / Math.max(1, n - 1) / env.stepPx,
                env.stepPx,
            ),
        ),
        rotation: frame.rotation,
    }),
    withFrame: (p, _n, frame) => ({
        ...p,
        center: frame.center,
        rotation: frame.rotation,
    }),
};

/**
 * A fourth test kind (#386, spec #385): a closed square pad that declares only its region and two
 * modes, Files and Outline, and leaves laying out its spots to the host's distributor. It shows
 * the distributor and the mode switch don't depend on the box.
 */
export interface PadParams {
    readonly center: XY;
    /** Field units between neighbors, both ways */
    readonly gap: number;
    readonly rotation: number;
    readonly distribution?: Distribution;
}

/** About square: the pad's own file count for `n` */
const padFiles = (n: number) =>
    Math.max(1, Math.ceil(Math.sqrt(Math.max(1, n))));

const padDistribution = (p: PadParams, n: number): Distribution =>
    storedDistribution(p, padFiles(n)) ?? filesDistribution(padFiles(n));

function padFrame(p: PadParams, n: number): ShapeFrame {
    const d = padDistribution(p, n);
    const { width, lines } = layoutLines(
        d.mode === "files" ? d.layout : filesDistribution(padFiles(n)).layout,
        n,
    );
    return {
        center: p.center,
        halfWidth: ((width - 1) * p.gap) / 2,
        halfDepth: ((lines.length - 1) * p.gap) / 2,
        rotation: p.rotation,
        flipX: false,
        flipY: false,
    };
}

function padSpots(p: PadParams, n: number) {
    const frame = padFrame(p, n);
    return distribute({
        region: rectRegion(frame.halfWidth, frame.halfDepth),
        n,
        distribution: padDistribution(p, n),
        across: p.gap,
        deep: p.gap,
    }).map((s) => ({ ...frameToField(frame, s), row: s.row, col: s.col }));
}

const padShape: ShapeKind<PadParams> = {
    ...(rowShape as unknown as ShapeKind<PadParams>),
    id: "test-pad",
    label: "Pad",
    family: "fill",
    fit: () => ({ center: { x: 0, y: 0 }, gap: 10, rotation: 0 }),
    outline: (p, n) => [padSpots(p, n).map(({ x, y }) => ({ x, y }))],
    generate: (p, n) => (n <= 0 ? [] : padSpots(p, n)),
    orderKey: (p, point, _ctx, n) => {
        const local = fieldToFrame(padFrame(p, n), point);
        return [local.y, local.x];
    },
};

export const padTool: ToolKind<PadParams> = {
    shape: padShape,
    params: rowTool.params as unknown as ToolKind<PadParams>["params"],
    scaling: "interval",
    draw(from, to, n, env) {
        const length = Math.abs(to.x - from.x);
        if (length < env.stepPx / 2) return undefined;
        return {
            center: env.gridSnap({
                x: (from.x + to.x) / 2,
                y: (from.y + to.y) / 2,
            }),
            gap: gapOf(
                length / Math.max(1, padFiles(n) - 1) / env.stepPx,
                env.stepPx,
            ),
            rotation: 0,
        };
    },
    handles: () => [],
    dragHandle: (base) => base,
    contains(p, n, at) {
        const frame = padFrame(p, n);
        const local = fieldToFrame(frame, at);
        return (
            Math.abs(local.x) <= frame.halfWidth + p.gap / 2 &&
            Math.abs(local.y) <= frame.halfDepth + p.gap / 2
        );
    },
    move: (base, _n, delta, env) => ({
        ...base,
        center: env.gridSnap({
            x: base.center.x + delta.x,
            y: base.center.y + delta.y,
        }),
    }),
    frameOf: padFrame,
    fromFrame: (frame, n, env) => ({
        center: frame.center,
        gap: gapOf(
            (2 * frame.halfWidth) / Math.max(1, padFiles(n) - 1) / env.stepPx,
            env.stepPx,
        ),
        rotation: frame.rotation,
    }),
    withFrame: (p, _n, frame) => ({
        ...p,
        center: frame.center,
        rotation: frame.rotation,
    }),
    closed: {
        modes: ["files", "outline"],
        region: (p, n) => {
            const frame = padFrame(p, n);
            return rectRegion(frame.halfWidth, frame.halfDepth);
        },
        distribution: padDistribution,
        intervals: (p) => ({ across: p.gap, deep: p.gap }),
        startMode: (_p, n, mode) => distributionFor(mode, padFiles(n), n),
        withDistribution: (p, _n, distribution) => ({ ...p, distribution }),
    },
};

/**
 * A fifth test kind (#524): a polyline drawn by clicking point after point, as well as by one drag.
 * Its points land on the grid; its spots spread evenly along it. It shows the host's click-to-add
 * draw doesn't depend on the Line.
 */
export interface PolyParams {
    readonly points: readonly XY[];
    /** Closed by a click on the first point (#529) */
    readonly closed?: true;
}

const polyLength = (points: readonly XY[]) =>
    points
        .slice(1)
        .reduce(
            (sum, b, i) =>
                sum + Math.hypot(b.x - points[i]!.x, b.y - points[i]!.y),
            0,
        );

function polySpots(p: PolyParams, n: number) {
    const total = polyLength(p.points);
    return Array.from({ length: n }, (_, i) => {
        let left = n > 1 ? (total * i) / (n - 1) : 0;
        for (let k = 1; k < p.points.length; k++) {
            const a = p.points[k - 1]!;
            const b = p.points[k]!;
            const len = Math.hypot(b.x - a.x, b.y - a.y);
            if (left <= len || k === p.points.length - 1) {
                const t = len === 0 ? 0 : Math.min(1, left / len);
                return {
                    x: a.x + (b.x - a.x) * t,
                    y: a.y + (b.y - a.y) * t,
                    row: 0,
                    col: i,
                };
            }
            left -= len;
        }
        return { ...p.points[0]!, row: 0, col: i };
    });
}

function polyFrame(p: PolyParams): ShapeFrame {
    const a = p.points[0]!;
    const b = p.points.at(-1)!;
    return {
        center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        halfWidth: Math.hypot(b.x - a.x, b.y - a.y) / 2,
        halfDepth: 0,
        rotation: Math.atan2(b.y - a.y, b.x - a.x),
        flipX: false,
        flipY: false,
    };
}

const polyShape: ShapeKind<PolyParams> = {
    ...(rowShape as unknown as ShapeKind<PolyParams>),
    id: "test-poly",
    label: "Poly",
    fit: () => ({
        points: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
        ],
    }),
    outline: (p) => [[...p.points]],
    generate: polySpots,
    orderKey: (_p, point) => [point.x],
};

/** The points as one shape, or undefined while they're under half a step long */
const polyOf = (points: readonly XY[], env: { stepPx: number }) =>
    polyLength(points) < env.stepPx / 2 ? undefined : { points };

export const polyTool: ToolKind<PolyParams> = {
    shape: polyShape,
    params: [],
    scaling: "footprint",
    draw: (from, to, _n, env) =>
        polyOf([env.gridSnap(from), env.gridSnap(to)], env),
    clickPoints: {
        land: (_previous, at, env) => env.gridSnap(at),
        draw: (points, _n, env) =>
            points.length < 2 ? undefined : polyOf(points, env),
        close: (points, _n, env) => {
            const p = polyOf(points, env);
            return p && { ...p, closed: true };
        },
    },
    handles: (p) =>
        p.points.map((at, i) => ({ key: `p${i}`, at, cursor: "move" })),
    dragHandle: (base) => base,
    contains: (p, n, at) =>
        polySpots(p, n).some((s) => Math.hypot(s.x - at.x, s.y - at.y) < 3),
    move: (base, _n, delta) => ({
        points: base.points.map((q) => ({
            x: q.x + delta.x,
            y: q.y + delta.y,
        })),
    }),
    frameOf: polyFrame,
    fromFrame: (frame) => ({
        points: [
            { x: frame.center.x - frame.halfWidth, y: frame.center.y },
            { x: frame.center.x + frame.halfWidth, y: frame.center.y },
        ],
    }),
    withFrame: (p) => p,
};
