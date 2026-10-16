import type { FieldProperties } from "@openmarch/core";
import { getRoundCoordinates2 } from "@/utilities/CoordinateActions";
import type { FieldPoint, FieldPointer } from "./fieldEditor";
import type { MarcherPosition } from "./moveGesture";

/**
 * The line tool (L, #203; #189 user stories 56 and 57): a click starts a line,
 * its end follows the pointer, and a second click finishes it. The marchers
 * it holds are ordered along the line and spaced evenly from its start to its
 * end, as previews; the app applies them (Shift+Enter) or cancels the tool
 * (Escape). A right-click clears the line. While the tool is on, no press
 * selects a marcher (rules table: Click target).
 */

/** A line on the field, from where it was started to its end. */
export type FieldLine = { start: FieldPoint; end: FieldPoint };

/** The order the marchers take along a line, from its start. */
export type LineOrder =
    | "leftToRight"
    | "rightToLeft"
    | "topToBottom"
    | "bottomToTop";

/**
 * A steep line (more than 45°, or straight up and down) orders the marchers
 * by y, otherwise by x, in the direction the line was drawn.
 */
export function lineOrder({ start, end }: FieldLine): LineOrder {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    if (dx === 0 || Math.abs(dy / dx) > 1)
        return start.y < end.y ? "topToBottom" : "bottomToTop";
    return start.x < end.x ? "leftToRight" : "rightToLeft";
}

/** `marchers` in their order along `line` (a stable sort: ties keep their order). */
export function orderAlongLine<T extends FieldPoint>(
    marchers: readonly T[],
    line: FieldLine,
): T[] {
    const by: Record<LineOrder, (a: T, b: T) => number> = {
        leftToRight: (a, b) => a.x - b.x,
        rightToLeft: (a, b) => b.x - a.x,
        topToBottom: (a, b) => a.y - b.y,
        bottomToTop: (a, b) => b.y - a.y,
    };
    return [...marchers].sort(by[lineOrder(line)]);
}

/** `count` points spaced evenly along `line`, its start first and its end last. */
export function spacedAlong(
    { start, end }: FieldLine,
    count: number,
): FieldPoint[] {
    const gaps = Math.max(count - 1, 1);
    return Array.from({ length: count }, (_, i) => ({
        x: start.x + ((end.x - start.x) * i) / gaps,
        y: start.y + ((end.y - start.y) * i) / gaps,
    }));
}

/** Where `marchers` go on `line`: ordered along it and spaced evenly. */
export function lineUp(
    marchers: readonly MarcherPosition[],
    line: FieldLine,
): MarcherPosition[] {
    const ordered = orderAlongLine(marchers, line);
    const spots = spacedAlong(line, ordered.length);
    return ordered.map(({ id }, i) => ({ id, ...spots[i] }));
}

/** The field's step grid, which line points round to. */
export type StepGrid = Pick<
    FieldProperties,
    "centerFrontPoint" | "pixelsPerStep"
>;

const WHOLE_STEPS = {
    coordinateRounding: { nearestXSteps: 1, nearestYSteps: 1 },
};

/** `point` rounded to the nearest whole step from center front. */
export function roundToStep(point: FieldPoint, grid: StepGrid): FieldPoint {
    const rounded = getRoundCoordinates2({
        coordinate: { xPixels: point.x, yPixels: point.y },
        uiSettings: WHOLE_STEPS,
        fieldProperties: grid,
    });
    return { x: rounded.xPixels, y: rounded.yPixels };
}

/** What the overlay draws for the line tool, and what the field test API reads. */
export type LineToolShape = {
    /** The marchers it lines up, outlined on the field. */
    readonly marchers: readonly number[];
    /** The line, or null before the first click and after a right-click. */
    readonly line: (FieldLine & { readonly drawing: boolean }) | null;
    /** Where each marcher goes once the line is finished, with where it is now. */
    readonly previews: readonly LinePreview[];
};

export type LinePreview = { id: number; from: FieldPoint; to: FieldPoint };

export type LineToolPorts = {
    /** Where the tool's marchers are drawn now. */
    marchers(): MarcherPosition[];
    /** The step grid, or null (no field yet): points aren't rounded. */
    grid(): StepGrid | null;
    /** A line was finished: where it puts the marchers, for the app to apply. */
    finished(targets: readonly MarcherPosition[]): void;
    /** The shape changed. */
    changed(): void;
};

export class LineTool {
    private line: FieldLine | null = null;
    private drawing = false;
    private snapshot: LineToolShape;

    constructor(
        readonly marchers: readonly number[],
        private readonly ports: LineToolPorts,
    ) {
        this.snapshot = { marchers, line: null, previews: [] };
    }

    /**
     * A primary press: starts a line, or finishes the one being drawn. Once a
     * line is finished, presses do nothing until a right-click clears it.
     */
    press(pointer: FieldPointer) {
        const point = this.pointAt(pointer);
        if (!this.line) {
            this.line = { start: point, end: point };
            this.drawing = true;
            this.update(this.snapshot.previews);
            return;
        }
        if (!this.drawing) return;
        this.line = { ...this.line, end: point };
        this.drawing = false;
        this.finish();
    }

    /** The end follows the pointer while the line is drawn. */
    move(pointer: FieldPointer) {
        if (!this.line || !this.drawing) return;
        this.line = { ...this.line, end: this.pointAt(pointer) };
        this.update(this.snapshot.previews);
    }

    /**
     * A right-click: clears the line, so the next click starts a new one. The
     * previews of a finished line stay until the next one is finished.
     */
    clear() {
        if (!this.line) return;
        this.line = null;
        this.drawing = false;
        this.update(this.snapshot.previews);
    }

    /**
     * The marchers are drawn somewhere else (a page change, playback): a
     * finished line lines them up again from there.
     */
    refresh() {
        if (this.line && !this.drawing) this.finish();
    }

    shape(): LineToolShape {
        return this.snapshot;
    }

    private finish() {
        if (!this.line) return;
        const now = this.ports.marchers();
        if (now.length < 2) {
            this.update(this.snapshot.previews);
            return;
        }
        const targets = lineUp(now, this.line);
        const from = new Map(now.map((m) => [m.id, m]));
        const previews = targets.map(({ id, x, y }) => {
            const start = from.get(id)!;
            return { id, from: { x: start.x, y: start.y }, to: { x, y } };
        });
        const before = this.snapshot.previews;
        // A refresh that moves nothing changes nothing
        if (
            this.snapshot.line?.drawing === false &&
            samePreviews(before, previews)
        )
            return;
        this.update(previews);
        if (!sameTargets(before, previews)) this.ports.finished(targets);
    }

    private pointAt(pointer: FieldPointer): FieldPoint {
        const grid = this.ports.grid();
        if (pointer.shift || !grid) return pointer.field;
        return roundToStep(pointer.field, grid);
    }

    private update(previews: readonly LinePreview[]) {
        this.snapshot = {
            marchers: this.marchers,
            line: this.line && { ...this.line, drawing: this.drawing },
            previews,
        };
        this.ports.changed();
    }
}

const samePoint = (a: FieldPoint, b: FieldPoint) => a.x === b.x && a.y === b.y;

/** The same marchers going to the same spots. */
const sameTargets = (a: readonly LinePreview[], b: readonly LinePreview[]) =>
    a.length === b.length &&
    a.every((p, i) => p.id === b[i].id && samePoint(p.to, b[i].to));

/** The same targets, from the same places. */
const samePreviews = (a: readonly LinePreview[], b: readonly LinePreview[]) =>
    sameTargets(a, b) && a.every((p, i) => samePoint(p.from, b[i].from));
