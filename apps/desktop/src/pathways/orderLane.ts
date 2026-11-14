/**
 * The order lane's drawing rules (pathways steps 4h and 4i), pure and in screen pixels (any
 * origin: the overlay works them out with the field's pan left out, and moves them by it).
 *
 * A line's order is a lane under its dots, wide enough to hold a dot and its selection ring, with a
 * solid tip past the leader: the whole thing is one arrow pointing the way the line travels. The
 * lane fades from dark at the leader to pale at the tail, always that way round, so where a marcher
 * sits in the order (front, middle, back) shows without numbers (step 4i). It carries its own ground
 * on any floor: a light wash under it, just strong enough for the floor beneath (none on a white
 * field), a faint rim, and a halo round every dot in the tone that sets that dot's color apart.
 * A lane never grows wider than half the gap to a marcher that isn't its neighbor in the order,
 * so the ranks of a block stay apart and a snake order can be traced.
 *
 * When the lane can't tell the story it steps back: an order that runs back over its own marchers
 * loses its tip and its fade (both would lie) and shows its numbers; one whose legs cross thins to a
 * thread with a dart per leg, and shows its numbers. Numbers are badges on one rail beside the dots,
 * thinned like ruler labels on a plain lane, never thinned on an order that doubles back or crosses
 * (that order is only readable from them): there they stagger into a second row, and where even two
 * rows can't fit, only the leader's and the tail's show and the field asks for a closer zoom.
 */
import type { XY } from "./orderSweep";

/** How an order is drawn */
export type OrderLaneKind =
    /** A lane with a tip */
    | "lane"
    /** It runs back over its own marchers: a lane without a tip, numbers on */
    | "folded"
    /** Its legs cross: a thread with darts, numbers on */
    | "crossed";

/** The lane's half width at a zoom: holds the dot (and its ring when selected), never a slab */
export function laneHalfWidth(
    dotRadius: number,
    ringReach: number,
    selected: boolean,
): number {
    const plain = Math.max(
        4.2,
        Math.min(11, dotRadius > 2.5 ? dotRadius + 5 : dotRadius * 2 + 1.7),
    );
    return selected ? Math.max(plain, ringReach + 3) : plain;
}

const cross = (p: XY, q: XY, s: XY) =>
    (q.x - p.x) * (s.y - p.y) - (q.y - p.y) * (s.x - p.x);

/** Whether segments ab and cd properly cross */
export function segmentsCross(a: XY, b: XY, c: XY, d: XY): boolean {
    return (
        cross(a, b, c) * cross(a, b, d) < 0 &&
        cross(c, d, a) * cross(c, d, b) < 0
    );
}

/** How far `p` is from segment ab */
export function distanceToSegment(p: XY, a: XY, b: XY): number {
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const length2 = vx * vx + vy * vy || 1;
    const t = Math.max(
        0,
        Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / length2),
    );
    return Math.hypot(p.x - a.x - t * vx, p.y - a.y - t * vy);
}

/**
 * How an order through `points` (leader first) is drawn: crossed when two legs that don't share a
 * marcher cross, folded when a leg runs over a marcher it doesn't end at, else a plain lane
 */
export function classifyOrder(
    points: readonly XY[],
    dotRadius: number,
): OrderLaneKind {
    const n = points.length;
    let folded = false;
    for (let i = 0; i + 1 < n; i++) {
        const a = points[i]!;
        const b = points[i + 1]!;
        for (let k = i + 2; k + 1 < n; k++)
            if (segmentsCross(a, b, points[k]!, points[k + 1]!))
                return "crossed";
        if (!folded)
            for (let k = 0; k < n; k++)
                if (
                    k !== i &&
                    k !== i + 1 &&
                    distanceToSegment(points[k]!, a, b) < dotRadius * 1.2
                ) {
                    folded = true;
                    break;
                }
    }
    return folded ? "folded" : "lane";
}

const unit = (from: XY, to: XY): XY => {
    const d = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    return { x: (to.x - from.x) / d, y: (to.y - from.y) / d };
};

/** A solid triangle as SVG points: its base's middle at `at`, pointing along `way` */
export function triangle(
    at: XY,
    way: XY,
    length: number,
    half: number,
): string {
    const nx = -way.y;
    const ny = way.x;
    return [
        [at.x + nx * half, at.y + ny * half],
        [at.x + way.x * length, at.y + way.y * length],
        [at.x - nx * half, at.y - ny * half],
    ]
        .map(([x, y]) => `${x},${y}`)
        .join(" ");
}

/** The lane's tip: past the leader, continuing the first leg outward; its points and its box */
export function laneTip(
    points: readonly XY[],
    halfWidth: number,
): { points: string; box: Box } | null {
    if (points.length < 2) return null;
    const lead = points[0]!;
    const way = unit(points[1]!, lead);
    const base = {
        x: lead.x + way.x * (halfWidth + 2.5),
        y: lead.y + way.y * (halfWidth + 2.5),
    };
    const middle = {
        x: base.x + way.x * halfWidth * 0.5,
        y: base.y + way.y * halfWidth * 0.5,
    };
    return {
        points: triangle(base, way, halfWidth * 1.05, halfWidth * 0.82),
        box: {
            minX: middle.x - halfWidth,
            minY: middle.y - halfWidth,
            maxX: middle.x + halfWidth,
            maxY: middle.y + halfWidth,
        },
    };
}

/** The fade's ink strength (alpha of the lane ink) at the leader and at the tail (step 4i) */
export const FADE_LEAD = 0.72;
export const FADE_TAIL = 0.14;
/** A crossed order's thread: its ink strength at the leader and at the tail */
export const THREAD_LEAD = 0.8;
export const THREAD_TAIL = 0.4;
/** A lane that doubles back is drawn flat at this strength (a fade on it would lie) */
export const FOLDED_INK = 0.15;

/** The ink strength `t` of the way along (0 at the leader, 1 at the tail) */
export const fadeAt = (t: number, lead = FADE_LEAD, tail = FADE_TAIL): number =>
    lead + (tail - lead) * Math.min(1, Math.max(0, t));

/** How far along the line each point is, by distance: 0 at the leader, 1 at the last point */
export function alongFractions(points: readonly XY[]): number[] {
    const run = [0];
    for (let i = 1; i < points.length; i++)
        run.push(
            run[i - 1]! +
                Math.hypot(
                    points[i]!.x - points[i - 1]!.x,
                    points[i]!.y - points[i - 1]!.y,
                ),
        );
    const total = run.at(-1)! || 1;
    return run.map((d) => d / total);
}

/**
 * A lane's own half width: never more than just under half the gap to a marcher of the same line
 * that isn't its neighbor in the order, so the ranks of a block (a snake through it) stay apart;
 * never thinner than its dots
 */
export function ownHalfWidth(
    points: readonly XY[],
    halfWidth: number,
    dotRadius: number,
): number {
    let nearest = Infinity;
    for (let a = 0; a < points.length; a++)
        for (let c = a + 2; c < points.length; c++)
            nearest = Math.min(
                nearest,
                Math.hypot(
                    points[a]!.x - points[c]!.x,
                    points[a]!.y - points[c]!.y,
                ),
            );
    if (nearest === Infinity) return halfWidth;
    return Math.max(dotRadius + 1.4, Math.min(halfWidth, nearest / 2 - 1.5));
}

/** Points along a lane, its middle and both edges, about every `every` pixels: where the floor is read */
export function laneSamplePoints(
    points: readonly XY[],
    halfWidth: number,
    every = 5,
): XY[] {
    const out: XY[] = [];
    for (let i = 0; i + 1 < points.length; i++) {
        const a = points[i]!;
        const b = points[i + 1]!;
        const length = Math.hypot(b.x - a.x, b.y - a.y);
        const way = unit(a, b);
        const nx = -way.y;
        const ny = way.x;
        for (let s = 0; s <= length; s += every)
            for (const o of [-halfWidth * 0.8, 0, halfWidth * 0.8])
                out.push({
                    x: a.x + way.x * s + nx * o,
                    y: a.y + way.y * s + ny * o,
                });
    }
    if (points.length === 1) out.push(points[0]!);
    return out;
}

/** The ground under a lane, as light as this (gamma-encoded brightness, 0 to 1), is what its ink is drawn on */
export const WASH_TARGET = 0.82;
/** A patterned floor's light and dark parts may differ by this much under the wash */
const WASH_PATTERN = 0.12;
/** The wash never hides the floor completely */
const WASH_MOST = 0.85;

/**
 * How strong a light wash a lane needs over a floor, from the floor's brightness under it (gamma
 * encoded, 0 to 1): enough that its darkest part comes up to `WASH_TARGET`, and enough that a pattern
 * (the spread between its 10th and 90th percentile) fades to `WASH_PATTERN`. None on a white field.
 */
export function washAlpha(samples: readonly number[]): number {
    if (samples.length === 0) return 0;
    const sorted = [...samples].sort((a, b) => a - b);
    const at = (q: number) =>
        sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
    const darkest = at(0.03);
    const spread = at(0.9) - at(0.1);
    const lift = (WASH_TARGET - darkest) / (1 - darkest || 1);
    const calm = spread > WASH_PATTERN ? 1 - WASH_PATTERN / spread : 0;
    const alpha = Math.min(WASH_MOST, Math.max(0, lift, calm));
    return alpha < 0.04 ? 0 : alpha;
}

/** An sRGB color, 0 to 255 a channel */
export interface Rgb {
    readonly r: number;
    readonly g: number;
    readonly b: number;
}

const linear = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

/** A color's relative luminance (WCAG), 0 to 1 */
export const relativeLuminance = ({ r, g, b }: Rgb): number =>
    0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);

/**
 * The halo round a dot: dark round a light dot (white, yellow, light gray), light round the rest.
 * The dot's color alone decides it, so it never flips between dots, floors or zoom levels.
 */
export const haloTone = (fill: Rgb): "light" | "dark" =>
    relativeLuminance(fill) > 0.45 ? "dark" : "light";

/** The halo's width round a dot of `dotRadius` on screen: thin when zoomed out, so a block isn't a mass */
export const haloWidth = (dotRadius: number): number =>
    dotRadius < 2 ? 0.9 : Math.max(1, Math.min(2, dotRadius * 0.5));

/** A crossed order's thread: a dart in the middle of every leg long enough to hold one */
export function threadDarts(points: readonly XY[]): string[] {
    const darts: string[] = [];
    for (let i = 0; i + 1 < points.length; i++) {
        const a = points[i]!;
        const b = points[i + 1]!;
        if (Math.hypot(b.x - a.x, b.y - a.y) <= 34) continue;
        const way = unit(b, a);
        darts.push(
            triangle(
                {
                    x: (a.x + b.x) / 2 - way.x * 3,
                    y: (a.y + b.y) / 2 - way.y * 3,
                },
                way,
                6,
                2.8,
            ),
        );
    }
    return darts;
}

/**
 * Each line's half width when several show at once: lanes of neighboring lines never touch, so a
 * lane narrows to just under half the gap to the nearest other line's dot (a shared spot where two
 * lines cross doesn't count), but never thinner than its dots
 */
export function neighborHalfWidths(
    lines: readonly (readonly XY[])[],
    halfWidths: readonly number[],
    dotRadius: number,
): number[] {
    return lines.map((line, l) => {
        let nearest = Infinity;
        lines.forEach((other, o) => {
            if (o === l) return;
            for (const p of line)
                for (const q of other) {
                    const d = Math.hypot(p.x - q.x, p.y - q.y);
                    if (d > dotRadius * 2.5) nearest = Math.min(nearest, d);
                }
        });
        return Math.max(
            dotRadius + 1.6,
            Math.min(halfWidths[l]!, nearest / 2 - 1.2),
        );
    });
}

/** A box on screen */
export interface Box {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
}

const overlaps = (a: Box, b: Box) =>
    a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY;

/** A position badge's height, and its font size, in screen pixels */
export const BADGE_HEIGHT = 12;
export const BADGE_FONT = 8.6;
/** A badge's width for its text: round for one digit, a pill for more */
export const badgeWidth = (text: string): number =>
    BADGE_HEIGHT + (text.length - 1) * 5;

/** A position badge as placed */
export interface PlacedBadge {
    /** Its middle on screen */
    readonly at: XY;
    readonly text: string;
    readonly role: "leader" | "middle" | "tail";
}

/** The numbers as placed, and whether some couldn't fit (the field then asks for a closer zoom) */
export interface PlacedNumbers {
    readonly badges: readonly PlacedBadge[];
    readonly crowded: boolean;
}

/**
 * Which positions (0-based) a plain lane numbers: every one when they fit, else every 2nd, 5th or
 * 10th like ruler labels, always the leader and the tail, and none crowding them
 */
export function thinnedPositions(count: number, gap: number): number[] {
    const room = (count >= 10 ? 17 : 12) + 7;
    let step = 1;
    for (const s of [1, 2, 5, 10]) {
        step = s;
        if (gap * s >= room) break;
    }
    const shown = Array.from({ length: count }, (_, k) => k).filter(
        (k) => k === 0 || k === count - 1 || (k + 1) % step === 0,
    );
    if (step > 1 && shown.length > 2 && shown[1]! * gap < room)
        shown.splice(1, 1);
    if (
        step > 1 &&
        shown.length > 2 &&
        (count - 1 - shown.at(-2)!) * gap < room - 3
    )
        shown.splice(-2, 1);
    return shown;
}

/** Where round its dot a badge may go, best first, as offsets from the dot */
function badgeSpots({
    kind,
    across,
    every,
    w,
    halfWidth,
    dotRadius,
}: {
    kind: OrderLaneKind;
    across: boolean;
    every: boolean;
    w: number;
    halfWidth: number;
    dotRadius: number;
}): XY[] {
    const H = BADGE_HEIGHT;
    const off = (kind === "crossed" ? dotRadius + 3 : halfWidth + 4) + H / 2;
    const side = off + (w - H) / 2;
    if (kind === "crossed")
        return [
            { x: 0, y: off },
            { x: side + 2, y: 2 },
            { x: -side - 2, y: 2 },
            { x: off, y: off * 0.8 },
            { x: -off, y: off * 0.8 },
            { x: 0, y: -off - 9 },
        ];
    if (across)
        return [
            { x: 0, y: off },
            ...(every ? [{ x: 0, y: off + H + 2 }] : []),
            { x: side, y: 0 },
            { x: -side, y: 0 },
            // Above, clear of the dot's name; a plain lane's rail then above the name
            { x: 0, y: -off - 9 },
            ...(every ? [] : [{ x: 0, y: -off - H - 14 }]),
        ];
    return [
        { x: side, y: 0 },
        { x: -side, y: 0 },
        ...(every
            ? [
                  { x: side + w + 2, y: 0 },
                  { x: -side - w - 2, y: 0 },
              ]
            : []),
        { x: 0, y: off },
    ];
}

/**
 * When some marcher's number has nowhere to go a partial count would mislead, so only the leader's
 * and the tail's show: each where it was placed, or else on the rail
 */
function endsOnly({
    badges,
    points,
    kind,
    across,
    halfWidth,
    dotRadius,
}: {
    badges: readonly PlacedBadge[];
    points: readonly XY[];
    kind: OrderLaneKind;
    across: boolean;
    halfWidth: number;
    dotRadius: number;
}): PlacedBadge[] {
    const n = points.length;
    const ends = n === 1 ? [0] : [0, n - 1];
    return ends.map((k): PlacedBadge => {
        const role = k === 0 ? "leader" : "tail";
        const kept = badges.find((b) => b.role === role);
        if (kept) return kept;
        const p = points[k]!;
        const off =
            (kind === "crossed" ? dotRadius + 3 : halfWidth + 4) +
            BADGE_HEIGHT / 2;
        return {
            at: across ? { x: p.x, y: p.y + off } : { x: p.x + off, y: p.y },
            text: `${k + 1}`,
            role,
        };
    });
}

/** Another line showing at the same time: a badge of this one never sits on its lane */
export interface OtherLane {
    readonly points: readonly XY[];
    readonly halfWidth: number;
}

/** Whether a badge in the middle of `at` would sit on any of `lanes` */
function onLane(at: XY, lanes: readonly OtherLane[]): boolean {
    const reach = BADGE_HEIGHT / 2 + 1;
    return lanes.some(({ points, halfWidth }) => {
        for (let i = 0; i + 1 < points.length; i++)
            if (
                distanceToSegment(at, points[i]!, points[i + 1]!) <
                halfWidth + reach
            )
                return true;
        return (
            points.length === 1 &&
            Math.hypot(at.x - points[0]!.x, at.y - points[0]!.y) <
                halfWidth + reach
        );
    });
}

/** A badge's box round its middle `at`, `pad` clear each side */
const badgeBox = (at: XY, w: number, pad: number): Box => ({
    minX: at.x - w / 2 - pad,
    minY: at.y - BADGE_HEIGHT / 2 - pad,
    maxX: at.x + w / 2 + pad,
    maxY: at.y + BADGE_HEIGHT / 2 + pad,
});

/** Whether an order spreads wider across the screen than up and down it */
function runsAcross(points: readonly XY[]): boolean {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    return (
        Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys)
    );
}

/** An order's typical (median) leg, on screen: one stacked pair doesn't thin the whole lane */
function typicalLeg(points: readonly XY[]): number {
    const legs = points
        .slice(1)
        .map((p, i) => Math.hypot(p.x - points[i]!.x, p.y - points[i]!.y))
        .sort((a, b) => a - b);
    return legs.length === 0 ? Infinity : legs[Math.floor(legs.length / 2)]!;
}

/**
 * The first of `candidates` (offsets from the dot at `p`) where a badge `w` wide touches none of
 * `avoid`, no dot but its own and no other line's lane; null when there's none
 */
function freeSpot({
    p,
    candidates,
    w,
    avoid,
    dots,
    dotRadius,
    lanes,
}: {
    p: XY;
    candidates: readonly XY[];
    w: number;
    avoid: readonly Box[];
    dots: readonly XY[];
    dotRadius: number;
    lanes: readonly OtherLane[];
}): { at: XY; box: Box } | null {
    const H = BADGE_HEIGHT;
    for (const c of candidates) {
        const at = { x: p.x + c.x, y: p.y + c.y };
        const box = badgeBox(at, w, 1);
        const hit =
            avoid.some((b) => overlaps(box, b)) ||
            dots.some(
                (d) =>
                    (d.x !== p.x || d.y !== p.y) &&
                    Math.hypot(d.x - at.x, d.y - at.y) < dotRadius + H / 2 + 1,
            );
        if (!hit && !onLane(at, lanes)) return { at, box };
    }
    return null;
}

/**
 * Where an order's position badges go. A plain lane's sit on one rail beside it (below a line that
 * runs across, to the right of one that runs up and down), thinned to what fits. An order that
 * doubles back or crosses numbers every marcher: each badge takes the first free spot of a few
 * round its dot, a second row further out among them, and when one finds none, only the leader's
 * and the tail's are kept and `crowded` says so. A badge keeps clear of `busy` (labels, the tip),
 * of the other badges, of every dot in `dots` and of the other lines' lanes (`others`).
 */
export function placeNumbers({
    points,
    kind,
    halfWidth,
    dotRadius,
    busy,
    dots,
    others = [],
}: {
    points: readonly XY[];
    kind: OrderLaneKind;
    halfWidth: number;
    dotRadius: number;
    busy: readonly Box[];
    dots: readonly XY[];
    others?: readonly OtherLane[];
}): PlacedNumbers {
    const n = points.length;
    if (n === 0) return { badges: [], crowded: false };
    const across = runsAcross(points);
    const gap = typicalLeg(points);
    const every = kind !== "lane";
    const shown = every
        ? Array.from({ length: n }, (_, k) => k)
        : thinnedPositions(n, gap);
    const placed: Box[] = [];
    const badges: PlacedBadge[] = [];
    let crowded = false;
    for (const k of shown) {
        const p = points[k]!;
        const text = `${k + 1}`;
        const w = badgeWidth(text);
        const candidates = badgeSpots({
            kind,
            across,
            every,
            w,
            halfWidth,
            dotRadius,
        });
        let best = freeSpot({
            p,
            candidates,
            w,
            avoid: [...busy, ...placed],
            lanes: others,
            dots,
            dotRadius,
        });
        if (!best) {
            if (every) {
                crowded = true;
                continue;
            }
            // A plain lane's tip already says which way it runs: a middle number with nowhere
            // to go is left out rather than drawn over another; the ends always show, on the rail
            if (k !== 0 && k !== n - 1) continue;
            const at = { x: p.x + candidates[0]!.x, y: p.y + candidates[0]!.y };
            best = { at, box: badgeBox(at, w, 0) };
        }
        placed.push(best.box);
        badges.push({
            at: best.at,
            text,
            role: k === 0 ? "leader" : k === n - 1 ? "tail" : "middle",
        });
    }
    if (crowded)
        return {
            badges: endsOnly({
                badges,
                points,
                kind,
                across,
                halfWidth,
                dotRadius,
            }),
            crowded,
        };
    return { badges, crowded };
}
