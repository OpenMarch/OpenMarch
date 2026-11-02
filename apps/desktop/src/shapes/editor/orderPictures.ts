import type { OrderChoice } from "../assign";
import { leastTravel } from "../leastTravel";
import type { XY } from "../types";

/**
 * Who goes where's pictures (#559, owner's design C): four marchers drawn as their numbers where
 * they stand, an arrow, then the new line read as a sequence, the number of the marcher who lands
 * on each spot, first to last. Least travel reads 2 1 4 3 for the sample, Keep order 1 2 3 4, and
 * Reverse order 4 3 2 1. Everything here is pure.
 */

/** The menu's pictures are larger than the other menus': the numbers need the room */
export const ORDER_PICTURE_SIZE = { width: 72, height: 26 } as const;

/**
 * The sample: marchers 1 to 4, scattered so each answer lands them differently, and the new line's
 * spots below them, first to last
 */
const FROM: readonly XY[] = [
    { x: 11, y: 2 },
    { x: 1, y: 0 },
    { x: 29, y: 0 },
    { x: 19, y: 3 },
];
const TO: readonly XY[] = [0, 10, 20, 30].map((x) => ({ x, y: 16 }));
export const ORDER_SAMPLE = { from: FROM, to: TO } as const;

/** The spot each sample marcher takes by least travel, worked out by the real solver */
const NEAREST = leastTravel(FROM, TO);

/**
 * The new line read first spot to last: the number (from 1) of the sample marcher standing on each
 */
export function orderSequence(choice: OrderChoice): number[] {
    const spotOf =
        choice === "nearest"
            ? NEAREST
            : FROM.map((_, i) =>
                  choice === "reverse" ? FROM.length - 1 - i : i,
              );
    const sequence: number[] = [];
    spotOf.forEach((spot, i) => (sequence[spot] = i + 1));
    return sequence;
}

/** A number drawn in a picture, centered on where it stands */
export interface OrderPictureNumber {
    readonly x: number;
    readonly y: number;
    readonly n: number;
}

/** A picture laid out in {@link ORDER_PICTURE_SIZE}, in CSS px */
export interface OrderPicture {
    /** The marchers where they stand, drawn faint */
    readonly before: readonly OrderPictureNumber[];
    /** The arrow from before to after, at the picture's middle height */
    readonly arrow: {
        readonly x1: number;
        readonly x2: number;
        readonly y: number;
    };
    /** The new line, drawn under its numbers */
    readonly line: {
        readonly x1: number;
        readonly x2: number;
        readonly y: number;
    };
    /** The new line read as a sequence */
    readonly after: readonly OrderPictureNumber[];
}

const { width: W, height: H } = ORDER_PICTURE_SIZE;
/** Where the marchers stand: the left of the picture, the sample's depth stretched so they read scattered */
const BEFORE = { width: 30, pad: 3.5, stretch: 4 };

const before: readonly OrderPictureNumber[] = (() => {
    const pts = FROM.map((p) => ({ x: p.x, y: p.y * BEFORE.stretch }));
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const spanX = Math.max(...xs) - minX;
    const spanY = Math.max(...ys) - minY;
    const k = Math.min(
        (BEFORE.width - 2 * BEFORE.pad) / spanX,
        (H - 2 * BEFORE.pad) / spanY,
    );
    const offsetX = (BEFORE.width - spanX * k) / 2;
    const offsetY = (H - spanY * k) / 2;
    return pts.map((p, i) => ({
        x: offsetX + (p.x - minX) * k,
        y: offsetY + (p.y - minY) * k,
        n: i + 1,
    }));
})();

/** The picture for a choice */
export function orderPicture(choice: OrderChoice): OrderPicture {
    const step = 8;
    const first = W - 4 - step * (TO.length - 1);
    return {
        before,
        arrow: { x1: BEFORE.width + 1, x2: first - 4, y: H / 2 },
        line: { x1: first - 3, x2: W - 1, y: H / 2 + 6 },
        after: orderSequence(choice).map((n, j) => ({
            x: first + j * step,
            y: H / 2 - 0.5,
            n,
        })),
    };
}
