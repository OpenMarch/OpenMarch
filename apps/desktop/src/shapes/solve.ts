/**
 * Root finding shared by the shape code. Everything here is pure.
 */

/**
 * Where `g` crosses nought between `a` and `b`, which it does (`ga`, `gb` either side of it): by
 * false position, the Illinois way, so a nearly straight `g` takes a few calls, not dozens.
 * Within `tolerance` of it, or where `g` is within a ten-billionth of its value at the ends;
 * null when `g` isn't finite there. At most `steps` calls of `g`, then the middle of what's left:
 * where `g` jumps across nought rather than crossing it, it narrows down to the jump for as long
 * as it's let.
 */
export function falsePosition(
    g: (t: number) => number,
    a: number,
    ga: number,
    b: number,
    gb: number,
    tolerance: number,
    steps = 100,
): number | null {
    if (ga === 0) return a;
    if (gb === 0) return b;
    // Close enough by value: nearer nought than a ten-billionth of where it started
    const close = Math.max(Math.abs(ga), Math.abs(gb)) * 1e-10;
    let side = 0;
    for (let i = 0; i < steps; i++) {
        if (!Number.isFinite(ga) || !Number.isFinite(gb)) return null;
        if (Math.abs(b - a) <= tolerance) return (a + b) / 2;
        let c = b - (gb * (b - a)) / (gb - ga);
        // Never on or past the bracket's ends: halve instead
        if (!(c > Math.min(a, b) && c < Math.max(a, b))) c = (a + b) / 2;
        const gc = g(c);
        if (Math.abs(gc) <= close) return c;
        if (gc * gb < 0) {
            a = b;
            ga = gb;
            side = 0;
        } else if (side === -1) {
            // The same end kept twice running: halve its value, so the other end moves too
            ga /= 2;
        } else side = -1;
        b = c;
        gb = gc;
    }
    return (a + b) / 2;
}

/**
 * Where `g` crosses nought, by secant steps from `a` and `b` (`ga` and `gb` their values) until
 * they straddle it, then {@link falsePosition}. "outside" when a step leaves `lo` to `hi`;
 * undefined when that doesn't settle it within a few steps (`g` turning back, or not finite), so
 * the caller searches some other way. `steps` limits the false position.
 */
export function secantFrom(
    g: (t: number) => number,
    a: number,
    ga: number,
    b: number,
    gb: number,
    lo: number,
    hi: number,
    tolerance: number,
    steps?: number,
): number | "outside" | undefined {
    if (!Number.isFinite(ga)) return undefined;
    if (ga === 0) return a;
    // Secant steps can close in from one side without ever straddling it
    const close = Math.abs(ga) * 1e-10;
    for (let i = 0; i < 8 && ga * gb > 0; i++) {
        if (Math.abs(gb) <= close) return b;
        if (!Number.isFinite(gb) || gb === ga) return undefined;
        // Moving away from it: `g` turns back, or this is the wrong way
        if (Math.abs(gb) > Math.abs(ga) && i > 0) return undefined;
        const c = b - (gb * (b - a)) / (gb - ga);
        if (!(c >= lo && c <= hi)) return "outside";
        a = b;
        ga = gb;
        b = c;
        gb = g(c);
    }
    if (!(ga * gb <= 0)) return undefined;
    return falsePosition(g, a, ga, b, gb, tolerance, steps) ?? undefined;
}
