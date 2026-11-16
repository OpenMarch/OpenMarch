import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
    arePitPlansLoaded,
    loadPitPlans,
    pitPlanOf,
    placePitPlan,
    subscribePitPlans,
} from "@/view3d/core/pit/pitPlan";
import { PIT_MANIFEST, pitModelName } from "@/view3d/core/pit/pitModels";
import { pitPreset, type PitPresetSize } from "@/view3d/core/pit/presets";

/** One 5-yard step, in meters */
const FIVE_YARDS = 4.572;
/** How much field shows above the front sideline, in meters */
const FIELD_SHOWN = 2;
/** Room around the largest preset, in meters */
const MARGIN = 1.2;

/**
 * Every picture shares the Large preset's frame, so a smaller pit looks smaller: the 50 at the
 * middle, as wide as the Large pit's instruments (its outer speakers fall past the edges, so the
 * instruments stay big enough to read), from a little field above the front sideline down past
 * the podium and the mixer.
 */
const FRAME = (() => {
    const { equipment } = pitPreset("large");
    let halfWidth = 0;
    let depth = 0;
    for (const e of equipment) {
        if (e.familyId === "speaker") continue;
        const size = sizeOf(e.variantId);
        const reach = Math.hypot(size.width, size.depth) / 2;
        halfWidth = Math.max(halfWidth, Math.abs(e.x) + reach);
        depth = Math.max(depth, e.z + reach);
    }
    halfWidth += MARGIN;
    return {
        x: -halfWidth,
        y: -FIELD_SHOWN,
        width: halfWidth * 2,
        height: FIELD_SHOWN + depth + MARGIN,
    };
})();

function sizeOf(modelId: string): { width: number; depth: number } {
    const name = pitModelName(modelId);
    return (name && PIT_MANIFEST[name]?.high.sizeM) || { width: 1, depth: 1 };
}

const pathOf = (points: readonly { x: number; y: number }[], closed: boolean) =>
    points
        .map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(3)} ${p.y.toFixed(3)}`)
        .join("") + (closed ? "Z" : "");

/**
 * A preset seen from above, as the field draws it (instruments.md section 6): a strip of the
 * field above the front sideline, the pit area, each piece of equipment's silhouette from its
 * model, and its players. `null` draws the field with no pit. Drawn in the default field's colors,
 * as a picture of the field, whatever the app's theme. Decorative: the card around it names it.
 */
export default function PitPresetPicture({
    size,
    className,
}: {
    size: PitPresetSize | null;
    className?: string;
}) {
    const loaded = useSyncExternalStore(subscribePitPlans, arePitPlansLoaded);
    useEffect(() => {
        void loadPitPlans();
    }, []);
    const drawn = useMemo(() => {
        if (!size) return null;
        const preset = pitPreset(size);
        const pieces = preset.equipment.map((e) => {
            const plan = loaded ? pitPlanOf(e.variantId) : null;
            if (plan) {
                const placed = placePitPlan(
                    plan,
                    { x: e.x, y: e.z },
                    e.rotation,
                    1,
                );
                return placed.outlines
                    .map((ring) => pathOf(ring, true))
                    .join("");
            }
            // Until the drawings load: the footprint
            const { width, depth } = sizeOf(e.variantId);
            const r = (e.rotation * Math.PI) / 180;
            const corners = [
                [-width / 2, -depth / 2],
                [width / 2, -depth / 2],
                [width / 2, depth / 2],
                [-width / 2, depth / 2],
            ].map(([x, z]) => ({
                x: e.x + x * Math.cos(r) - z * Math.sin(r),
                y: e.z + x * Math.sin(r) + z * Math.cos(r),
            }));
            return pathOf(corners, true);
        });
        const xs = preset.equipment.map((e) => e.x);
        const zs = preset.equipment.map((e) => e.z);
        const pad = 1.5;
        return {
            pieces,
            players: preset.performers,
            area: {
                x: Math.min(...xs) - pad - 1,
                width: Math.max(...xs) - Math.min(...xs) + 2 * pad + 2,
                height: Math.max(...zs) + pad + 1,
            },
        };
    }, [size, loaded]);

    const yardLines: number[] = [];
    for (let x = 0; x <= -FRAME.x; x += FIVE_YARDS) {
        yardLines.push(x);
        if (x > 0) yardLines.push(-x);
    }
    return (
        <svg
            viewBox={`${FRAME.x} ${FRAME.y} ${FRAME.width} ${FRAME.height}`}
            className={className}
            aria-hidden
            preserveAspectRatio="xMidYMin meet"
        >
            <rect
                x={FRAME.x}
                y={FRAME.y}
                width={FRAME.width}
                height={FRAME.height}
                fill="#f6f6f7"
            />
            <rect
                x={FRAME.x}
                y={FRAME.y}
                width={FRAME.width}
                height={FIELD_SHOWN}
                fill="#ffffff"
            />
            {yardLines.map((x) => (
                <line
                    key={x}
                    x1={x}
                    x2={x}
                    y1={FRAME.y}
                    y2={0}
                    stroke="#000000"
                    strokeWidth={x === 0 ? 0.16 : 0.08}
                />
            ))}
            {drawn && (
                <rect
                    x={drawn.area.x}
                    y={0}
                    width={drawn.area.width}
                    height={drawn.area.height}
                    fill="#ededed"
                />
            )}
            <line
                x1={FRAME.x}
                x2={-FRAME.x}
                y1={0}
                y2={0}
                stroke="#000000"
                strokeWidth={0.22}
            />
            {drawn?.pieces.map((d, i) => (
                <path
                    key={i}
                    d={d}
                    fill="rgba(0, 0, 0, 0.12)"
                    stroke="#2b2b33"
                    strokeWidth={0.07}
                    strokeLinejoin="round"
                />
            ))}
            {drawn?.players.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.z} r={0.28} fill="#ff0000" />
            ))}
        </svg>
    );
}
