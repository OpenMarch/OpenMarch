import type { FieldGesture, FieldPoint, FieldPointer } from "./fieldEditor";
import { hitRadius, type DrawnMarchers } from "./hitTest";
import {
    lassoCloses,
    marchersInPolygon,
    marchersInRect,
    rectBetween,
    selectionAfterArea,
    type FieldRect,
} from "./selectionArea";

/**
 * The marquee and the lasso (#195): drags on empty field that select an area.
 * The overlay draws {@link AreaShape}; nothing else does.
 */

/** What the overlay draws during a marquee or lasso, in field units. */
export type AreaShape =
    | { kind: "marquee"; rect: FieldRect }
    | {
          kind: "lasso";
          points: readonly FieldPoint[];
          /** Releasing now closes the lasso and selects: the stroke turns green. */
          closes: boolean;
      };

/** What a marquee or lasso reads and writes. */
export type AreaPorts = {
    marchers(): DrawnMarchers;
    zoom(): number;
    canSelect(id: number): boolean;
    selection(): readonly number[];
    select(ids: readonly number[]): void;
    /** The shape changed: the overlay draws it again. */
    changed(): void;
};

export interface AreaGesture extends FieldGesture {
    /** The same object until the shape changes, so React can tell. */
    shape(): AreaShape;
}

/**
 * A marquee: the rectangle from the press to the pointer. On release it
 * replaces the selection with every marcher whose dot it touches; with Shift
 * held at the press, it adds them.
 */
export function startMarquee(
    ports: AreaPorts,
    start: FieldPointer,
): AreaGesture {
    let shape: AreaShape = {
        kind: "marquee",
        rect: rectBetween(start.field, start.field),
    };
    return {
        kind: "marquee",
        shape: () => shape,
        move(next) {
            shape = {
                kind: "marquee",
                rect: rectBetween(start.field, next.field),
            };
            ports.changed();
        },
        end(next) {
            const inside = marchersInRect(
                ports.marchers(),
                rectBetween(start.field, next.field),
                hitRadius(ports.zoom()),
                ports.canSelect,
            );
            ports.select(
                selectionAfterArea(ports.selection(), inside, start.shift),
            );
        },
        cancel() {},
    };
}

/**
 * A lasso: a freehand line from the press. Released within
 * `LASSO_CLOSE_DISTANCE` (50) screen px of its start it closes, and replaces
 * the selection with every marcher whose center is inside it (Shift at the
 * press adds them). Released farther away, it selects nothing and changes
 * nothing; the double-click's first click has already cleared the selection,
 * unless Shift was held.
 */
export function startLasso(ports: AreaPorts, start: FieldPointer): AreaGesture {
    // Appended to in place: a long lasso isn't copied on every move
    const points: FieldPoint[] = [start.field];
    let shape: AreaShape = { kind: "lasso", points, closes: true };
    const add = (point: FieldPoint) => {
        points.push(point);
        shape = {
            kind: "lasso",
            points,
            closes: lassoCloses(start.field, point, ports.zoom()),
        };
    };
    return {
        kind: "lasso",
        shape: () => shape,
        move(next) {
            add(next.field);
            ports.changed();
        },
        end(next) {
            add(next.field);
            if (!lassoCloses(start.field, next.field, ports.zoom())) return;
            const inside = marchersInPolygon(
                ports.marchers(),
                points,
                ports.canSelect,
            );
            ports.select(
                selectionAfterArea(ports.selection(), inside, start.shift),
            );
        },
        cancel() {},
    };
}
