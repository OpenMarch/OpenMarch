import type { AssignMarcher } from "../assign";
import { groupAt } from "../group/groupGeometry";
import { groupTool } from "../group/groupTool";
import { pivotByHand } from "../frame/gestures";
import { leastTravelOnto } from "../leastTravel";
import { PLACED_KINDS, placedOf, type PlacedBox } from "../placed/placedBox";
import type { AnyToolKind, ToolEnv, ToolKind } from "../tool/toolKind";
import type { GroupParams } from "../group/groupGeometry";
import type { ShapeContext, XY } from "../types";

/**
 * A copied picture (#961): where a selection of marchers stood, to paste onto other marchers.
 * Pasting rearranges the marchers selected then; it never adds any, and the picture doesn't say
 * who stood where. Everything here is pure.
 *
 * It's kept by the app, not on the system clipboard (`pictureStore.ts`), and its `version` is
 * checked when it's read back, so the format can change.
 */
export interface CopiedPicture {
    readonly version: typeof PICTURE_VERSION;
    /** Field units per step on the field it was copied from, so it keeps its size in steps */
    readonly stepPx: number;
    /** Where each copied marcher stood, in field units: what loose dots paste as */
    readonly dots: readonly XY[];
    /** The placed shape, when the selection was exactly one: it pastes as a shape of its kind */
    readonly shape?: CopiedShape;
}

/** A placed shape as copied: its recipe's kind and params, without its spot count or members */
export interface CopiedShape {
    readonly kind: string;
    readonly kindVersion: number;
    readonly params: unknown;
}

export const PICTURE_VERSION = 1;

/**
 * Loose dots as the paste preview shows them (#961): the group kind's geometry, so they move,
 * turn, flip and scale like any open shape, but placed as plain marchers with no recipe. Who goes
 * where can be worked out again, unlike a group made where its marchers stand.
 */
export const dotsTool: ToolKind<GroupParams> = {
    ...groupTool,
    asIs: false,
    loose: true,
};

/** A copied group as the paste preview shows it: placed as a group, who goes where worked out */
export const pastedGroupTool: ToolKind<GroupParams> = {
    ...groupTool,
    asIs: false,
};

/**
 * The picture a selection copies: `shape` when it's exactly one placed shape (its members the
 * marchers standing at `positions`), loose dots otherwise. Null with nobody to copy.
 */
export function pictureOf({
    positions,
    shape,
    stepPx,
}: {
    positions: readonly XY[];
    shape: Pick<PlacedBox, "recipe" | "params"> | null;
    stepPx: number;
}): CopiedPicture | null {
    if (positions.length === 0) return null;
    return {
        version: PICTURE_VERSION,
        stepPx,
        dots: positions.map((p) => ({ x: p.x, y: p.y })),
        ...(shape && {
            shape: {
                kind: shape.recipe.kind,
                kindVersion: shape.recipe.kindVersion,
                params: shape.params,
            },
        }),
    };
}

const isPoint = (v: unknown): v is XY =>
    typeof v === "object" &&
    v !== null &&
    Number.isFinite((v as XY).x) &&
    Number.isFinite((v as XY).y);

/** A picture read back from storage; null for anything this app can't paste */
export function readPicture(stored: unknown): CopiedPicture | null {
    if (typeof stored !== "object" || stored === null) return null;
    const { version, stepPx, dots, shape } = stored as Partial<CopiedPicture>;
    if (version !== PICTURE_VERSION) return null;
    if (!(typeof stepPx === "number" && stepPx > 0)) return null;
    if (!Array.isArray(dots) || dots.length === 0 || !dots.every(isPoint))
        return null;
    const kept =
        typeof shape === "object" &&
        shape !== null &&
        typeof shape.kind === "string" &&
        typeof shape.kindVersion === "number" &&
        typeof shape.params === "object" &&
        shape.params !== null
            ? shape
            : undefined;
    return {
        version,
        stepPx,
        dots: dots.map((p) => ({ x: p.x, y: p.y })),
        ...(kept && {
            shape: {
                kind: kept.kind,
                kindVersion: kept.kindVersion,
                params: kept.params,
            },
        }),
    };
}

/**
 * The copied shape as this field can lay it out: its kind and params, or null when the picture
 * pastes as its dots (none copied, a kind or version this app doesn't know, or a field with
 * another step size)
 */
function readShape(
    picture: CopiedPicture,
    stepPx: number,
    kinds: readonly AnyToolKind[],
    asPositions = false,
): { kind: AnyToolKind; params: unknown } | null {
    if (!picture.shape) return null;
    // A group always pastes as a group: its spots are where its marchers stood
    if (asPositions && picture.shape.kind !== groupTool.shape.id) return null;
    if (Math.abs(stepPx / picture.stepPx - 1) > SAME_STEP) return null;
    return placedOf({ id: 0, ...picture.shape, members: [] }, kinds);
}

/**
 * What the copied picture is, as the Clipboard chip and card say it (#961): a shape that is
 * laid out for any number of marchers, or spots that only so many fill (a group, or positions)
 */
export interface PictureSummary {
    readonly type: "shape" | "group" | "positions";
    /** The kind it pastes as, for a shape or a group */
    readonly kind: AnyToolKind | null;
    /** How many marchers were copied: the spots a group or positions has */
    readonly count: number;
    /** Whether it pastes onto any number of marchers (a shape), or fills `count` spots */
    readonly anyNumber: boolean;
}

/** What `picture` pastes as on a field `stepPx` field units to the step */
export function pictureSummary(
    picture: CopiedPicture,
    stepPx: number,
    {
        kinds = PLACED_KINDS,
        asPositions = false,
    }: {
        kinds?: readonly AnyToolKind[];
        /** A copied shape pasted as its exact positions (the Clipboard card's switch) */
        asPositions?: boolean;
    } = {},
): PictureSummary {
    const read = readShape(picture, stepPx, kinds, asPositions);
    const count = picture.dots.length;
    if (!read)
        return { type: "positions", kind: null, count, anyNumber: false };
    if (read.kind === groupTool)
        return { type: "group", kind: groupTool, count, anyNumber: false };
    return { type: "shape", kind: read.kind, count, anyNumber: true };
}

/**
 * How the picture fits `selected` marchers: laid out for them (a shape), every spot filled, some
 * spots left empty, or some marchers left where they are. Nothing selected: `none`.
 */
export type PictureFit =
    | { readonly fit: "none" }
    | { readonly fit: "laidOut"; readonly selected: number }
    | { readonly fit: "exact"; readonly selected: number }
    | {
          readonly fit: "emptySpots";
          readonly selected: number;
          readonly empty: number;
      }
    | {
          readonly fit: "leftOut";
          readonly selected: number;
          readonly left: number;
      };

export function pictureFit(
    summary: PictureSummary,
    selected: number,
): PictureFit {
    if (selected <= 0) return { fit: "none" };
    if (summary.anyNumber) return { fit: "laidOut", selected };
    if (selected === summary.count) return { fit: "exact", selected };
    return selected < summary.count
        ? { fit: "emptySpots", selected, empty: summary.count - selected }
        : { fit: "leftOut", selected, left: selected - summary.count };
}

/** What a paste opens: the shape to preview and the marchers who take its spots */
export interface PastePlan {
    readonly kind: AnyToolKind;
    readonly params: unknown;
    /** The receiving marchers who take a spot, in the order they were given */
    readonly marchers: readonly AssignMarcher[];
    /** Whether the shape's pivot was moved by hand, so the preview keeps it */
    readonly pivotMoved: boolean;
    /** How many receiving marchers have no spot: loose dots pasted onto more marchers than dots */
    readonly left: number;
}

/** Sizes within this of each other are the same step size */
const SAME_STEP = 1e-6;

const middle = (points: readonly XY[]): XY => {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    return {
        x: (Math.min(...xs) + Math.max(...xs)) / 2,
        y: (Math.min(...ys) + Math.max(...ys)) / 2,
    };
};

/**
 * How far a picture whose middle is `from` moves to sit on the receiving marchers: onto the
 * middle of where they stand, in whole half steps, so every spot keeps its place on the grid.
 * Nowhere for Paste exactly.
 */
function shift(
    from: XY,
    marchers: readonly AssignMarcher[],
    stepPx: number,
    inPlace: boolean,
): XY {
    if (inPlace) return { x: 0, y: 0 };
    const to = middle(marchers.map((m) => m.at));
    const half = stepPx / 2;
    return {
        x: Math.round((to.x - from.x) / half) * half,
        y: Math.round((to.y - from.y) / half) * half,
    };
}

const startOf = (m: AssignMarcher): XY => m.from ?? m.at;

/** `v` to the nearest whole half step */
const toHalf = (v: number, stepPx: number) =>
    Math.round(v / (stepPx / 2)) * (stepPx / 2);

const plus = (points: readonly XY[], by: XY): XY[] =>
    points.map((p) => ({ x: p.x + by.x, y: p.y + by.y }));

/** How many times a centered paste of loose dots refits them onto the receivers at most */
const FITS = 8;

/**
 * Loose dots fitted onto receivers they don't match in number (#961): where the dots go, which
 * dots are used (fewer receivers) or which receivers take one (more). From centered on the
 * receivers, the dots move by whole half steps until the pairs that would walk least line up
 * on average. So receivers already standing on some of the dots stay on them, and pasting
 * again onto the same marchers doesn't move them (simulated users saw about 5 steps a paste).
 */
function fitDots(
    copied: readonly XY[],
    marchers: readonly AssignMarcher[],
    start: XY,
    stepPx: number,
): { by: XY; spots: number[] | null; taking: number[] | null } {
    const at = marchers.map((m) => m.at);
    let by = start;
    let spots: number[] | null = null;
    let taking: number[] | null = null;
    for (let i = 0; i < FITS; i++) {
        const dots = plus(copied, by);
        // Each pair: a receiver where it stands, and the dot it would take
        let pairs: [XY, XY][];
        if (marchers.length <= dots.length) {
            spots = leastTravelOnto(at, dots);
            pairs = spots.map((spot, m) => [at[m]!, dots[spot]!]);
        } else {
            taking = leastTravelOnto(dots, at);
            pairs = taking.map((m, spot) => [at[m]!, dots[spot]!]);
        }
        const off = {
            x: toHalf(
                pairs.reduce((sum, [a, d]) => sum + a.x - d.x, 0) /
                    pairs.length,
                stepPx,
            ),
            y: toHalf(
                pairs.reduce((sum, [a, d]) => sum + a.y - d.y, 0) /
                    pairs.length,
                stepPx,
            ),
        };
        if (off.x === 0 && off.y === 0) break;
        by = { x: by.x + off.x, y: by.y + off.y };
    }
    return { by, spots, taking };
}

/** Field units within which a marcher stands on a spot */
const ON_SPOT = 1e-3;

/**
 * Who goes where when every marcher already stands on a spot of the paste, each on a different
 * one: each keeps their own (`at[i]` takes spot `result[i]`). A paste onto marchers an earlier
 * paste put there, as a shape this time, then moves nobody, where least travel from the move's
 * start could swap them. Null when anyone isn't on a spot.
 */
export function standingOnSpots(
    at: readonly XY[],
    spots: readonly XY[],
): number[] | null {
    const taken = new Set<number>();
    const kept: number[] = [];
    for (const p of at) {
        const spot = spots.findIndex(
            (s, i) =>
                !taken.has(i) &&
                Math.abs(s.x - p.x) <= ON_SPOT &&
                Math.abs(s.y - p.y) <= ON_SPOT,
        );
        if (spot < 0) return null;
        taken.add(spot);
        kept.push(spot);
    }
    return kept;
}

/** What a kind lays a pasted shape out with: the field's half-step grid, snapping on */
function pasteEnv(stepPx: number, ctx: ShapeContext | undefined): ToolEnv {
    const half = stepPx / 2;
    return {
        stepPx,
        snap: true,
        constrain: false,
        gridSnap:
            ctx?.snapPoint ??
            (({ x, y }) => ({
                x: Math.round(x / half) * half,
                y: Math.round(y / half) * half,
            })),
        hitRadius: 0,
    };
}

/**
 * A copied shape laid out for `marchers`: in the space it took for the `copied` marchers where
 * its kind can (a box or a circle, owner 2026-11-22), from its own numbers otherwise. Centered on them
 * by the middle of its spots where it has them, since a frame's center can sit off them (7 on a
 * circle) and pasting again onto marchers standing in it would move it; where it was copied for
 * a paste `inPlace`.
 */
function planShape(
    { kind, params: copiedParams }: { kind: AnyToolKind; params: unknown },
    copied: number,
    marchers: readonly AssignMarcher[],
    stepPx: number,
    inPlace: boolean,
    ctx: ShapeContext | undefined,
): PastePlan {
    const n = marchers.length;
    const params =
        kind.atCount?.(copiedParams, copied, n, pasteEnv(stepPx, ctx)) ??
        copiedParams;
    const frame = kind.frameOf(params, n);
    const spots = ctx ? kind.shape.generate(params, n, ctx) : [];
    const by = shift(
        spots.length > 0 ? middle(spots) : frame.center,
        marchers,
        stepPx,
        inPlace,
    );
    const moved =
        by.x === 0 && by.y === 0
            ? params
            : kind.withFrame(params, n, {
                  ...frame,
                  center: {
                      x: frame.center.x + by.x,
                      y: frame.center.y + by.y,
                  },
              });
    return {
        kind,
        params: moved,
        marchers,
        pivotMoved: pivotByHand(kind, moved),
        left: 0,
    };
}

/**
 * What pasting `picture` onto `marchers` opens (#961, owner 2026-11-15). The preview starts
 * centered on the receiving marchers, or where it was copied for a paste `inPlace`.
 *
 * - A **shape** keeps its kind and settings and is laid out for the receiving count. A box or a
 *   circle keeps the space it took, its spacing whatever that takes (owner 2026-11-22: a circle of
 *   15 pasted onto 8 is as big). A line, arc or curve is laid out between its own ends.
 * - **Loose dots** (and a group, whose spots have no rule either) only fill spots. With fewer
 *   marchers than dots, the dots that give the shortest total walk are used; with more, the
 *   marchers with the shortest total walk take the dots and the rest are left where they are.
 *   Centered, the dots are fitted onto the receivers, so marchers already standing on some of
 *   them stay there.
 *
 * A shape this app can't lay out (a newer kind, or a picture from a field with another step size)
 * pastes as loose dots, kept the same size in steps. Null with nobody to paste onto.
 */
export function planPaste({
    picture,
    marchers,
    stepPx,
    inPlace = false,
    asPositions = false,
    kinds = PLACED_KINDS,
    ctx,
}: {
    picture: CopiedPicture;
    /** The receiving marchers, where they stand and where they start the move */
    marchers: readonly AssignMarcher[];
    /** Field units per step on the field pasted onto */
    stepPx: number;
    inPlace?: boolean;
    /** A copied shape pasted as its exact positions, plain marchers with no shape */
    asPositions?: boolean;
    kinds?: readonly AnyToolKind[];
    /** The field's shape context: a shape centers its spots, not its frame, on the receivers */
    ctx?: ShapeContext;
}): PastePlan | null {
    const n = marchers.length;
    if (n === 0) return null;
    const scale = stepPx / picture.stepPx;
    const sameStep = Math.abs(scale - 1) <= SAME_STEP;
    const read = readShape(picture, stepPx, kinds, asPositions);

    if (read && read.kind !== groupTool)
        return planShape(
            read,
            picture.dots.length,
            marchers,
            stepPx,
            inPlace,
            ctx,
        );

    // Loose dots: the same spot in steps on a field with another step size
    const copied = sameStep
        ? picture.dots
        : picture.dots.map((p) => ({ x: p.x * scale, y: p.y * scale }));
    const centered = shift(middle(copied), marchers, stepPx, inPlace);
    // A centered paste onto another number of marchers fits the dots onto them
    const fit =
        inPlace || n === copied.length
            ? null
            : fitDots(copied, marchers, centered, stepPx);
    const dots = plus(copied, fit?.by ?? centered);
    const kind = read ? pastedGroupTool : dotsTool;
    const starts = marchers.map(startOf);

    if (n === dots.length)
        return {
            kind,
            params: groupAt(dots),
            marchers,
            pivotMoved: false,
            left: 0,
        };

    if (n < dots.length) {
        // The dots that give the shortest walk are the spots; the rest stay empty, drawn with
        // them while the paste is open so the whole copy shows
        const whole = groupAt(dots);
        const used = fit?.spots ?? leastTravelOnto(starts, dots);
        const taken = new Set(used);
        return {
            kind,
            params: {
                ...whole,
                points: used.map((spot) => whole.points[spot]!),
                empty: whole.points.filter((_, spot) => !taken.has(spot)),
            },
            marchers,
            pivotMoved: false,
            left: 0,
        };
    }

    // More marchers than dots: the marchers with the shortest walk take them
    const taking = new Set(fit?.taking ?? leastTravelOnto(dots, starts));
    return {
        kind,
        params: groupAt(dots),
        marchers: marchers.filter((_, i) => taking.has(i)),
        pivotMoved: false,
        left: n - dots.length,
    };
}
