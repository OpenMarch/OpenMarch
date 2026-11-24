import { memo, useEffect, useState } from "react";
import { prefersReducedMotion } from "@/components/timeline/reducedMotion";
import { cometHead, cometStrength, cometTiming } from "./orderComet";
import type { XY } from "./orderSweep";

/**
 * A line's order as a comet (`orderComet`): a ring round each dot, lit in turn from the leader to
 * the last marcher with a fading tail behind, then a rest, again and again while the order shows.
 * Dots and their colors are left alone. Nothing runs for someone who asked their system for less
 * motion.
 */
const OrderCometRings = memo(function OrderCometRings({
    points,
    radius,
    dotRadius,
    light,
}: {
    /** The line's marchers on screen (pan left out), leader first */
    points: readonly XY[];
    /** Where the ring sits: just outside the dot, its selection ring and halo */
    radius: number;
    dotRadius: number;
    /** Light rings, for a dark field */
    light: boolean;
}) {
    const elapsed = useElapsed();
    if (elapsed === null) return null;
    const count = points.length;
    const timing = cometTiming(count);
    const head = cometHead(elapsed, count, timing);
    if (head === null) return null;
    const grow = Math.max(3, dotRadius * 0.5);
    const width = Math.max(1.6, dotRadius * 0.3);
    const rgb = light ? "255,255,255" : "28,31,38";
    const lo = Math.max(0, Math.floor(head - timing.tail));
    const hi = Math.min(count - 1, Math.ceil(head + 1));
    const rings = [];
    for (let i = lo; i <= hi; i++) {
        const a = cometStrength(i, head, timing.tail);
        const p = points[i];
        if (a <= 0.02 || !p) continue;
        const r = radius + 1.5 + a * grow;
        rings.push(
            <g key={i}>
                <circle
                    cx={p.x}
                    cy={p.y}
                    r={r + width * 1.6}
                    fill="none"
                    stroke={`rgba(${rgb},${(a * 0.35).toFixed(3)})`}
                    strokeWidth={width * 1.6 * a}
                />
                <circle
                    cx={p.x}
                    cy={p.y}
                    r={r}
                    fill="none"
                    stroke={`rgba(${rgb},${(0.25 + 0.75 * a).toFixed(3)})`}
                    strokeWidth={width * (0.6 + a)}
                />
            </g>,
        );
    }
    return <g data-testid="marcherOrderComet">{rings}</g>;
});

export default OrderCometRings;

/** Milliseconds since the comet first showed, every frame; null when motion is turned down */
function useElapsed(): number | null {
    const [reduced] = useState(prefersReducedMotion);
    const [elapsed, setElapsed] = useState(0);
    useEffect(() => {
        if (reduced) return;
        let frame = 0;
        const start = performance.now();
        const tick = (now: number) => {
            setElapsed(now - start);
            frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [reduced]);
    return reduced ? null : elapsed;
}
