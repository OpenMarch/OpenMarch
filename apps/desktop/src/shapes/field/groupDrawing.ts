import tolgee from "@/global/singletons/Tolgee";
import { parseSteps } from "../editor/format";
import type { Slot, XY } from "../types";
import type { AnyToolKind } from "../tool/toolKind";
import type { GroupMenuState } from "./shapePointer";

/**
 * The colors of a Line's interval groups (#526 follow-up), in the group menu's dots and on the
 * field. Hues from a well-known color-blind-safe palette: told apart by people with any common
 * color blindness, mid-tone so they read on the light and the dark field, and none of them the
 * shape's purple or the next path's green. More groups than colors take them round again.
 */
export const GROUP_COLORS = [
    "#E69F00", // orange
    "#56B4E9", // sky blue
    "#D55E00", // vermilion
    "#0072B2", // blue
    "#CC79A7", // pink
] as const;

/** Group `index`'s color */
export const groupColor = (index: number): string =>
    GROUP_COLORS[
        ((index % GROUP_COLORS.length) + GROUP_COLORS.length) %
            GROUP_COLORS.length
    ]!;

/**
 * How a spot's group shows: `faint` while the menu is open and no group is lit, `lit` for the
 * group pointed at, `dim` for the others then
 */
export type GroupMarkShade = "faint" | "lit" | "dim";

/** A spot ringed in its group's color */
export interface GroupMark {
    readonly at: XY;
    readonly color: string;
    readonly shade: GroupMarkShade;
    readonly group: number;
}

/**
 * A gap of the lit group labeled with its interval, at its middle along the shape: "3", "↔ 2½". A
 * `seam` is the gap
 * where the lit group meets a neighbor, labeled with the interval it takes there, the larger of the
 * two groups' (`groupGaps`).
 */
export interface GroupGapLabel {
    readonly at: XY;
    readonly text: string;
    readonly color: string;
    /** The gap's two spots, which way it runs */
    readonly from: XY;
    readonly to: XY;
    readonly seam: boolean;
    /**
     * How long the gap is along the shape, in field units, when that isn't the straight line
     * between its spots (it goes round a corner or a curve)
     */
    readonly length?: number;
    /** The lit group as one label, "2 at 3", for when its gaps are too short for one each */
    readonly whole: string;
}

/**
 * What the field draws of a shape's interval groups while the editor's group menu is open: each
 * spot ringed in its group's color, and with a group lit, every gap in it labeled with its
 * interval (and the axis, on a Measured line), and the seams where it meets its neighbors with
 * theirs. Nothing with the menu closed or a shape without
 * groups. `spots` are the shape's spots in order along it, as its kind lays them out; a gap's label
 * stands at its middle along the shape when the kind says where that is (`along`). Pure: a
 * drawing only, nothing is edited.
 */
export function groupDrawing(
    kind: AnyToolKind,
    params: unknown,
    n: number,
    spots: readonly Slot[],
    menu: GroupMenuState | null,
    stepPx: number,
): { groupMarks?: GroupMark[]; groupLabels?: GroupGapLabel[] } {
    if (!menu || !kind.groups) return {};
    const shown = kind.groups.shown(params, n, stepPx);
    if (!shown || shown.length < 2) return {};
    const marks: GroupMark[] = [];
    const labels: GroupGapLabel[] = [];
    const axis = kind.groups.axis?.(params) ?? null;
    const prefix = axis === "x" ? "↔ " : axis === "y" ? "↕ " : "";
    // Where each group starts along the shape, and its count as laid out: a dropped group's is 0
    const starts: number[] = [];
    let at = 0;
    for (const g of shown) {
        starts.push(at);
        at += Number(g.count);
    }
    const gap = (k: number) => {
        const from = spots[k - 1]!;
        const to = spots[k]!;
        const along = kind.groups!.along?.(params, from, to);
        return {
            from,
            to,
            ...(along
                ? { at: along.at, length: along.length }
                : { at: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 } }),
        };
    };
    shown.forEach((g, group) => {
        const count = Number(g.count);
        const start = starts[group]!;
        const color = groupColor(group);
        const shade: GroupMarkShade =
            menu.lit === null ? "faint" : menu.lit === group ? "lit" : "dim";
        for (let k = 0; k < count && start + k < spots.length; k++)
            marks.push({ at: spots[start + k]!, color, shade, group });
        if (menu.lit !== group || count === 0) return;
        const whole =
            prefix +
            tolgee.t("shapes.groups.countAt", "{count} at {interval}", {
                count: g.count,
                interval: g.interval,
            });
        for (let k = 1; k < count && start + k < spots.length; k++)
            labels.push({
                ...gap(start + k),
                text: prefix + g.interval,
                color,
                seam: false,
                whole,
            });
        // The seams either side, with the next group that has marchers
        const before = shown
            .slice(0, group)
            .findLastIndex((o) => Number(o.count) > 0);
        const after = shown.findIndex(
            (o, i) => i > group && Number(o.count) > 0,
        );
        const seam = (k: number, other: number) => {
            if (k < 1 || k >= spots.length) return;
            labels.push({
                ...gap(k),
                text: prefix + wider(g.interval, shown[other]!.interval),
                color,
                seam: true,
                whole,
            });
        };
        if (before >= 0) seam(start, before);
        if (after >= 0) seam(starts[after]!, after);
    });
    return { groupMarks: marks, groupLabels: labels };
}

/** The larger of two intervals as shown ("3", "2½"); the first when either isn't understood */
function wider(a: string, b: string): string {
    const x = parseSteps(a);
    const y = parseSteps(b);
    return x !== null && y !== null && y > x ? b : a;
}

/** A gap label's pill, in CSS px: its text's size and height */
export const GROUP_LABEL_PX = 10;
export const GROUP_LABEL_HEIGHT = 14;
/** Room between a pill and the ring it stands beside, in CSS px */
const GROUP_LABEL_CLEARANCE = 2;
/** Room a gap needs on screen past its pill's own length to keep a pill of its own, in CSS px */
export const GROUP_LABEL_ROOM = 4;

/** A gap label's pill width in CSS px: about its text in DM Sans, with room either side */
export const groupLabelWidth = (text: string): number =>
    text.length * GROUP_LABEL_PX * 0.6 + 8;

/** A gap label where the overlay draws it, in CSS px */
export interface PlacedGroupLabel {
    readonly at: XY;
    readonly text: string;
    readonly color: string;
    readonly seam: boolean;
}

/**
 * Where the overlay draws the lit group's gap labels (review of #577), in CSS px: beside the line
 * rather than on it, clear of the rings, so close-set marchers stay in sight. Each pill moves
 * across its gap, perpendicular to it, by the ring's radius and its own half-size that way; the
 * group's gaps always go to the side that faces up the screen (left on an upright gap), its seams
 * to the other side, so the two never meet. When the group's gaps are shorter on screen than a
 * pill (and a little room), measured along the shape where it bends between the spots, it gets one label at its middle ("2 at 3") instead of one per gap.
 * `toScreen` maps a field point to CSS px; `ringPx` is a ring's radius there; `abovePx` is what
 * stands above each ring (the spots' names), which a pill moving up clears too.
 */
export function placeGroupLabels(
    labels: readonly GroupGapLabel[],
    toScreen: (point: XY) => XY,
    ringPx: number,
    abovePx = 0,
): PlacedGroupLabel[] {
    const across = (l: GroupGapLabel) => {
        const a = toScreen(l.from);
        const b = toScreen(l.to);
        const length = Math.hypot(b.x - a.x, b.y - a.y);
        const along =
            length > 1e-9
                ? { x: (b.x - a.x) / length, y: (b.y - a.y) / length }
                : { x: 1, y: 0 };
        // Perpendicular, facing up the screen (or left, on an upright gap)
        let normal = { x: -along.y, y: along.x };
        if (normal.y > 1e-9 || (Math.abs(normal.y) <= 1e-9 && normal.x > 0))
            normal = { x: -normal.x, y: -normal.y };
        return { length, along, normal };
    };
    const place = (
        l: GroupGapLabel,
        text: string,
        point: XY,
        dir: XY,
        side: 1 | -1,
    ) => {
        const p = toScreen(point);
        const w = groupLabelWidth(text);
        const shift =
            ringPx +
            (Math.abs(dir.x) * w) / 2 +
            (Math.abs(dir.y) * GROUP_LABEL_HEIGHT) / 2 +
            GROUP_LABEL_CLEARANCE +
            Math.max(0, -dir.y * side) * abovePx;
        return {
            at: {
                x: p.x + dir.x * shift * side,
                y: p.y + dir.y * shift * side,
            },
            text,
            color: l.color,
            seam: l.seam,
        };
    };
    // A gap's length on screen: along the shape where the label knows it, else its chord
    const onScreen = (l: GroupGapLabel, chord: number) => {
        if (l.length === undefined) return chord;
        const a = toScreen(l.at);
        const b = toScreen({ x: l.at.x + 1, y: l.at.y });
        return Math.max(chord, l.length * Math.hypot(b.x - a.x, b.y - a.y));
    };
    const gaps = labels.filter((l) => !l.seam);
    const seams = labels.filter((l) => l.seam);
    const placed: PlacedGroupLabel[] = [];
    const crowded = gaps.some((l) => {
        const { length: chord, along } = across(l);
        const w = groupLabelWidth(l.text);
        return (
            onScreen(l, chord) <
            Math.abs(along.x) * w +
                Math.abs(along.y) * GROUP_LABEL_HEIGHT +
                GROUP_LABEL_ROOM
        );
    });
    if (crowded) {
        // One label at the group's middle: its middle gap, or the spot between its two middle gaps
        const mid = gaps[Math.floor(gaps.length / 2)]!;
        const point = gaps.length % 2 === 1 ? mid.at : mid.from;
        placed.push(place(mid, mid.whole, point, across(mid).normal, 1));
    } else
        for (const l of gaps)
            placed.push(place(l, l.text, l.at, across(l).normal, 1));
    for (const l of seams)
        placed.push(place(l, l.text, l.at, across(l).normal, -1));
    return placed;
}
