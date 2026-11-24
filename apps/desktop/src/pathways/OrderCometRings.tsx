import { memo, useEffect, useState } from "react";
import {
    cometHead,
    cometRingSize,
    cometStrength,
    cometTiming,
} from "./orderComet";
import type { Box } from "./orderLane";
import type { XY } from "./orderSweep";

/**
 * A line's order as a comet (`orderComet`): a ring round each dot, lit in turn from the leader to
 * the last marcher with a fading tail behind, then a rest, again and again while the order shows.
 * Dots and their colors are left alone, and the rings are cut away from the names they pass. The
 * overlay mounts it only while the field animates (not when motion is turned down, nor in
 * Performance mode), and gives each line its own, so a newly shown line starts at its leader.
 */
const OrderCometRings = memo(function OrderCometRings({
    id,
    points,
    radius,
    dotRadius,
    light,
    names,
}: {
    /** For the mask that cuts the names out */
    id: string;
    /** The line's marchers on screen (pan left out), leader first */
    points: readonly XY[];
    /** Where the ring sits: just outside the dot, its selection ring and halo */
    radius: number;
    dotRadius: number;
    /** Light rings, for a dark floor */
    light: boolean;
    /** The names drawn near the line, whose ink the rings keep off */
    names: readonly Box[];
}) {
    const count = points.length;
    const timing = cometTiming(count);
    const head = useCometHead(
        count,
        timing.travelMs,
        timing.restMs,
        timing.tail,
    );
    if (head === null) return null;
    const { grow, width, reach } = cometRingSize(radius, dotRadius);
    const rgb = light ? "255,255,255" : "28,31,38";
    const lo = Math.max(0, Math.floor(head - timing.tail));
    const hi = Math.min(count - 1, Math.ceil(head + 1));
    const rings = [];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = lo; i <= hi; i++) {
        const a = cometStrength(i, head, timing.tail);
        const p = points[i];
        if (a <= 0.02 || !p) continue;
        const r = radius + 1.5 + a * grow;
        minX = Math.min(minX, p.x - reach);
        minY = Math.min(minY, p.y - reach);
        maxX = Math.max(maxX, p.x + reach);
        maxY = Math.max(maxY, p.y + reach);
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
    if (rings.length === 0) return null;
    // Only the names the lit rings reach, over only the lit rings: the cut is redrawn every frame
    const b: Box = { minX, minY, maxX, maxY };
    const near = names.filter(
        (n) =>
            n.maxX >= b.minX &&
            n.minX <= b.maxX &&
            n.maxY >= b.minY &&
            n.minY <= b.maxY,
    );
    return (
        <g data-testid="marcherOrderComet">
            {near.length > 0 && (
                <defs>
                    <mask
                        id={id}
                        maskUnits="userSpaceOnUse"
                        x={b.minX}
                        y={b.minY}
                        width={b.maxX - b.minX}
                        height={b.maxY - b.minY}
                    >
                        <rect
                            x={b.minX}
                            y={b.minY}
                            width={b.maxX - b.minX}
                            height={b.maxY - b.minY}
                            fill="white"
                        />
                        {near.map((n, i) => (
                            <rect
                                key={i}
                                x={n.minX - 1}
                                y={n.minY - 1}
                                width={n.maxX - n.minX + 2}
                                height={n.maxY - n.minY + 2}
                                rx={1.5}
                                fill="black"
                            />
                        ))}
                    </mask>
                </defs>
            )}
            <g mask={near.length > 0 ? `url(#${id})` : undefined}>{rings}</g>
        </g>
    );
});

export default OrderCometRings;

/**
 * Where the comet's head is (`cometHead`), from when it mounted: every frame while it travels,
 * and asleep through the rest, so a resting comet costs nothing
 */
function useCometHead(
    count: number,
    travelMs: number,
    restMs: number,
    tail: number,
): number | null {
    const [head, setHead] = useState<number | null>(count >= 2 ? 0 : null);
    useEffect(() => {
        if (count < 2) {
            setHead(null);
            return;
        }
        const timing = { travelMs, restMs, tail };
        const run = travelMs + restMs;
        const start = performance.now();
        let frame = 0;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const tick = (now: number) => {
            const elapsed = now - start;
            const at = cometHead(elapsed, count, timing);
            setHead(at);
            if (at !== null) frame = requestAnimationFrame(tick);
            else
                timer = setTimeout(
                    () => (frame = requestAnimationFrame(tick)),
                    run - (elapsed % run),
                );
        };
        frame = requestAnimationFrame(tick);
        return () => {
            cancelAnimationFrame(frame);
            clearTimeout(timer);
        };
    }, [count, travelMs, restMs, tail]);
    return head;
}
