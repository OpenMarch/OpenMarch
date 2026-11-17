import type { FieldAxis } from "@/field/edits";

/**
 * What a typed line position means (#824's popover): a distance from the center (X, on the side
 * picked next to it) or behind the front (Y), never negative.
 *
 * - `24`: 24 steps.
 * - `+4` / `-4`: 4 steps further out / further in than now (Y: further back / further front).
 * - `47.5yd`: the 47.5 yard line (X on a football field: 8 steps to 5 yards from the 50). Also
 *   `+2.5yd`.
 * - Arithmetic: `85.33/2`, `(40+48)/2`, `3*8`.
 *
 * Returns null for anything else, or a result below 0.
 */
export function resolveTypedPosition(
    text: string,
    {
        axis,
        football,
        current,
    }: {
        axis: FieldAxis;
        /** Yards count from the 50 (a field with hashes, as the yard-line names) */
        football: boolean;
        /** The distance now, for `+4` and `-4` */
        current: number;
    },
): number | null {
    let source = text.trim().toLowerCase().replace(/\s+/g, "");
    if (source === "") return null;
    const relative = source.startsWith("+") || source.startsWith("-");
    let yards = false;
    const unit = /(yds?|yards?)$/.exec(source);
    if (unit) {
        if (axis !== "x" || !football) return null;
        yards = true;
        source = source.slice(0, -unit[0].length);
    }
    const value = evaluate(source);
    if (value === null || !Number.isFinite(value)) return null;
    let distance: number;
    if (yards)
        // Yard lines count down from the 50, 8 steps to 5 yards; "+2.5yd" is 2.5 yards further out
        distance = relative
            ? current + (value * 8) / 5
            : ((50 - value) * 8) / 5;
    else distance = relative ? current + value : value;
    distance = Number(distance.toFixed(6));
    if (distance < 0) return null;
    return distance === 0 ? 0 : distance;
}

/**
 * The value of an arithmetic expression of numbers, + - * / and parentheses; null when it
 * isn't one. A leading sign is the number's own.
 */
export function evaluate(source: string): number | null {
    let at = 0;
    const peek = () => source[at];
    const number = (): number | null => {
        const match = /^\d*\.?\d+|^\d+\./.exec(source.slice(at));
        if (!match) return null;
        at += match[0].length;
        return Number(match[0]);
    };
    const factor = (): number | null => {
        const c = peek();
        if (c === "+" || c === "-") {
            at++;
            const inner = factor();
            return inner === null ? null : c === "-" ? -inner : inner;
        }
        if (c === "(") {
            at++;
            const inner = sum();
            if (inner === null || peek() !== ")") return null;
            at++;
            return inner;
        }
        return number();
    };
    const product = (): number | null => {
        let left = factor();
        while (left !== null && (peek() === "*" || peek() === "/")) {
            const op = source[at++];
            const right = factor();
            if (right === null) return null;
            if (op === "/" && right === 0) return null;
            left = op === "*" ? left * right : left / right;
        }
        return left;
    };
    const sum = (): number | null => {
        let left = product();
        while (left !== null && (peek() === "+" || peek() === "-")) {
            const op = source[at++];
            const right = product();
            if (right === null) return null;
            left = op === "+" ? left + right : left - right;
        }
        return left;
    };
    const result = sum();
    return result !== null && at === source.length ? result : null;
}

/** What a distance from the center is as a yard line ("47.5"), on a football field; null past the goal line */
export function yardLineOf(distance: number): string | null {
    const yard = 50 - (distance * 5) / 8;
    if (yard < -1e-9) return null;
    return String(Number(Math.max(0, yard).toFixed(2)));
}
