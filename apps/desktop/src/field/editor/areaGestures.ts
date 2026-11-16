import {
    pressChoiceOf,
    type AreaChoice,
    type PressChoice,
} from "@/input/modifierRoles";
import type { FieldGesture, FieldPoint, FieldPointer } from "./fieldEditor";
import { hitRadius, type DrawnMarchers } from "./hitTest";
import {
    areaPicks,
    fingerLassoCloses,
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
 * The marchers releasing the area now would change, so the overlay can outline them and count
 * them by the pointer: the ones it selects (or, adding, the ones it adds; subtracting, the ones it
 * takes out). Positions in field units, x then y for each id.
 */
export type AreaPreview = {
    readonly ids: readonly number[];
    readonly positions: readonly number[];
    /** What releasing does with them */
    readonly choice: AreaChoice;
    /** The pointer, where the count goes */
    readonly pointer: FieldPoint;
};

/**
 * What the overlay draws during a marquee or lasso, in field units. `subtract`: it removes what it
 * covers from the selection (Alt at the press), and is drawn so.
 */
export type AreaShape =
    | {
          kind: "marquee";
          rect: FieldRect;
          subtract: boolean;
          preview: AreaPreview;
      }
    | {
          kind: "lasso";
          points: readonly FieldPoint[];
          /** Releasing now closes the lasso and selects: the stroke turns green. */
          closes: boolean;
          subtract: boolean;
          preview: AreaPreview;
      };

/** What a marquee or lasso reads and writes. */
export type AreaPorts = {
    marchers(): DrawnMarchers;
    zoom(): number;
    canSelect(id: number): boolean;
    /** Whether a marcher is an item (C2.2), which an area takes only when nothing else is in it */
    isItem?(id: number): boolean;
    /** Whether a marcher is a locked item, which an area never takes */
    isLocked?(id: number): boolean;
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
 * The marchers whose selection releasing an area changes, of those it picks (`inside`): all of
 * them when it replaces the selection, the unselected ones when it adds, the selected ones when it
 * subtracts.
 */
export function areaChanges(
    current: readonly number[],
    inside: readonly number[],
    choice: AreaChoice,
): readonly number[] {
    if (choice === null) return inside;
    const selected = new Set(current);
    return inside.filter((id) =>
        choice === "subtract" ? selected.has(id) : !selected.has(id),
    );
}

/** What the overlay shows for an area that picks `inside` with the pointer at `pointer`. */
function previewOf(
    ports: AreaPorts,
    inside: readonly number[],
    choice: AreaChoice,
    pointer: FieldPoint,
): AreaPreview {
    const ids = areaChanges(ports.selection(), inside, choice);
    const wanted = new Set(ids);
    const marchers = ports.marchers();
    const ordered: number[] = [];
    const positions: number[] = [];
    if (wanted.size > 0)
        for (let i = 0; i < marchers.ids.length; i++) {
            if (!wanted.has(marchers.ids[i])) continue;
            ordered.push(marchers.ids[i]);
            positions.push(
                marchers.positions[i * 2],
                marchers.positions[i * 2 + 1],
            );
        }
    return { ids: ordered, positions, choice, pointer };
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
    const picks = (end: FieldPoint) =>
        areaPicks(
            marchersInRect(
                ports.marchers(),
                rectBetween(start.field, end),
                hitRadius(ports.zoom()),
                ports.canSelect,
            ),
            (id) => ports.isItem?.(id) ?? false,
            (id) => ports.isLocked?.(id) ?? false,
        );
    const shapeAt = (
        end: FieldPoint,
        inside: readonly number[],
    ): AreaShape => ({
        kind: "marquee",
        rect: rectBetween(start.field, end),
        subtract,
        preview: previewOf(ports, inside, choice, end),
    });
    let shape = shapeAt(start.field, []);
    return {
        kind: "marquee",
        shape: () => shape,
        move(next) {
            shape = shapeAt(next.field, picks(next.field));
            ports.changed();
        },
        end(next) {
            ports.select(
                selectionAfterArea(
                    ports.selection(),
                    picks(next.field),
                    choice,
                ),
            );
        },
        cancel() {},
    };
}

/**
 * A lasso: a freehand line from the press. Released within
 * `LASSO_CLOSE_DISTANCE` (50) screen px of its start it closes, and replaces
 * the selection with every marcher whose center is inside it, as a marquee
 * picks them (Shift at the press adds them, Alt removes them). Released farther away, it selects
 * nothing and changes nothing. After a double-click, its first click has already cleared the
 * selection, unless Shift or Alt was held; with the Lasso tool there was no first click.
 *
 * Drawn by a finger or a pen (#933, owner), it closes when released within 150 screen px of its
 * start, or when the path closed back to its start takes in a real area
 * (`fingerLassoCloses`): a fingertip hides where the line began. A long straight swipe does
 * neither, and changes nothing.
 */
export function startLasso(
    ports: AreaPorts,
    start: FieldPointer,
    isMac?: boolean,
): AreaGesture {
    const choice = areaChoice(start, isMac);
    const subtract = choice === "subtract";
    const byFinger = start.kind !== "mouse";
    const closes = (end: FieldPoint) =>
        byFinger
            ? fingerLassoCloses(points, ports.zoom())
            : lassoCloses(start.field, end, ports.zoom());
    // Appended to in place: a long lasso isn't copied on every move
    const points: FieldPoint[] = [start.field];
    const picks = () =>
        areaPicks(
            marchersInPolygon(ports.marchers(), points, ports.canSelect),
            (id) => ports.isItem?.(id) ?? false,
            (id) => ports.isLocked?.(id) ?? false,
        );
    let shape: AreaShape = {
        kind: "lasso",
        points,
        closes: true,
        subtract,
        preview: previewOf(ports, [], choice, start.field),
    };
    const add = (point: FieldPoint) => {
        points.push(point);
        shape = {
            kind: "lasso",
            points,
            closes: closes(point),
            subtract,
            // What it takes if it closes now: shown faded until it would
            preview: previewOf(ports, picks(), choice, point),
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
            points.push(next.field);
            if (!closes(next.field)) return;
            ports.select(
                selectionAfterArea(ports.selection(), picks(), choice),
            );
        },
        cancel() {},
    };
}
