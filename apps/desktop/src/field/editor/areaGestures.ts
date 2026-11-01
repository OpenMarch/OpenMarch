import {
    pressChoiceOf,
    type AreaChoice,
    type PressChoice,
} from "@/input/modifierRoles";
import type { FieldGesture, FieldPoint, FieldPointer } from "./fieldEditor";
import { hitRadius, type DrawnMarchers } from "./hitTest";
import {
    areaPicks,
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

/**
 * What the overlay draws during a marquee or lasso, in field units. `subtract`: it removes what it
 * covers from the selection (Alt at the press), and is drawn so.
 */
export type AreaShape =
    | { kind: "marquee"; rect: FieldRect; subtract: boolean }
    | {
          kind: "lasso";
          points: readonly FieldPoint[];
          /** Releasing now closes the lasso and selects: the stroke turns green. */
          closes: boolean;
          subtract: boolean;
      };

/** What a marquee or lasso reads and writes. */
export type AreaPorts = {
    marchers(): DrawnMarchers;
    zoom(): number;
    canSelect(id: number): boolean;
    /** Whether a marcher is an item (C2.2), which an area takes only when nothing else is in it */
    isItem?(id: number): boolean;
    selection(): readonly number[];
    select(ids: readonly number[]): void;
    /** The shape changed: the overlay draws it again. */
    changed(): void;
};

export interface AreaGesture extends FieldGesture {
    /** The same object until the shape changes, so React can tell. */
    shape(): AreaShape;
}

const AREA_CHOICES: ReadonlySet<PressChoice> = new Set(["add", "subtract"]);

/**
 * What an area does with what it covers, decided at the press: add (Shift), subtract (Alt; add
 * wins when both are held), or null to replace the selection.
 */
export function areaChoice(press: FieldPointer, isMac?: boolean): AreaChoice {
    const chosen = pressChoiceOf(press, "field", {
        applicable: AREA_CHOICES,
        isMac,
    })?.choice;
    return chosen === "add" || chosen === "subtract" ? chosen : null;
}

/**
 * A marquee: the rectangle from the press to the pointer. On release it
 * replaces the selection with every marcher whose dot it touches, leaving out
 * items when performers are among them (`areaPicks`); with Shift held at the
 * press, it adds them, and with Alt it removes them.
 */
export function startMarquee(
    ports: AreaPorts,
    start: FieldPointer,
    isMac?: boolean,
): AreaGesture {
    const choice = areaChoice(start, isMac);
    const subtract = choice === "subtract";
    let shape: AreaShape = {
        kind: "marquee",
        rect: rectBetween(start.field, start.field),
        subtract,
    };
    return {
        kind: "marquee",
        shape: () => shape,
        move(next) {
            shape = {
                kind: "marquee",
                rect: rectBetween(start.field, next.field),
                subtract,
            };
            ports.changed();
        },
        end(next) {
            const inside = areaPicks(
                marchersInRect(
                    ports.marchers(),
                    rectBetween(start.field, next.field),
                    hitRadius(ports.zoom()),
                    ports.canSelect,
                ),
                (id) => ports.isItem?.(id) ?? false,
            );
            ports.select(selectionAfterArea(ports.selection(), inside, choice));
        },
        cancel() {},
    };
}

/**
 * A lasso: a freehand line from the press. Released within
 * `LASSO_CLOSE_DISTANCE` (50) screen px of its start it closes, and replaces
 * the selection with every marcher whose center is inside it, as a marquee
 * picks them (Shift at the press adds them, Alt removes them). Released farther away, it selects
 * nothing and changes nothing; the double-click's first click has already cleared the selection,
 * unless Shift or Alt was held.
 */
export function startLasso(
    ports: AreaPorts,
    start: FieldPointer,
    isMac?: boolean,
): AreaGesture {
    const choice = areaChoice(start, isMac);
    const subtract = choice === "subtract";
    // Appended to in place: a long lasso isn't copied on every move
    const points: FieldPoint[] = [start.field];
    let shape: AreaShape = { kind: "lasso", points, closes: true, subtract };
    const add = (point: FieldPoint) => {
        points.push(point);
        shape = {
            kind: "lasso",
            points,
            closes: lassoCloses(start.field, point, ports.zoom()),
            subtract,
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
            const inside = areaPicks(
                marchersInPolygon(ports.marchers(), points, ports.canSelect),
                (id) => ports.isItem?.(id) ?? false,
            );
            ports.select(selectionAfterArea(ports.selection(), inside, choice));
        },
        cancel() {},
    };
}
