/**
 * The import review's axis preview (fork #1084): X, Y and Z drawn from the picture's own viewpoint
 * (`thumbnailView`), in a corner of the picture. While a Rotate button is pointed at or focused,
 * its axis stands out with an arrow around it showing which way the model will swing.
 */
import clsx from "clsx";
import { thumbnailView } from "@/showAssets/modelImport/thumbnail";

export type Axis = "x" | "y" | "z";

/** The usual 3D colors, readable on the picture's white background in both themes */
export const AXIS_COLORS: Record<Axis, string> = {
    x: "#e5484d",
    y: "#30a46c",
    z: "#3e63dd",
};

type V3 = [number, number, number];

const UNIT: Record<Axis, V3> = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

/**
 * Which way each button swings the model, as the quarter turn from one axis toward another:
 * X brings the top toward the audience, Y turns the front toward the right, Z lays the top to
 * the right (`orientation.ts`, `ModelImportChoices.turn`).
 */
export const SWING: Record<Axis, [V3, V3]> = {
    x: [UNIT.y, UNIT.z],
    y: [UNIT.z, UNIT.x],
    z: [UNIT.y, UNIT.x],
};

const SIZE = 96;
const CENTER = SIZE / 2;
const LENGTH = 30;
const RING = 18;
const LABEL_GAP = 9;

/** A point in the preview's pixels, y down */
function toPx(v: V3, length: number): [number, number] {
    const [x, y] = thumbnailView(...v);
    return [CENTER + x * length, CENTER - y * length];
}

/**
 * The arrow around an axis: three quarters of a circle in the swing's direction, with a head. It
 * starts and ends between axes, so the head stays clear of the axis letters.
 */
function ring(axis: Axis): { path: string; head: string } {
    const [from, toward] = SWING[axis];
    const points: [number, number][] = [];
    const steps = 28;
    const start = Math.PI / 4;
    const end = (Math.PI * 7) / 4;
    for (let i = 0; i <= steps; i++) {
        const t = start + ((end - start) * i) / steps;
        const v = from.map(
            (n, k) => n * Math.cos(t) + toward[k] * Math.sin(t),
        ) as V3;
        points.push(toPx(v, RING));
    }
    const path = points
        .map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`)
        .join("");
    // The head points along the last step
    const [x1, y1] = points[steps - 1];
    const [x2, y2] = points[steps];
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const wing = (side: number): string => {
        const a = angle + Math.PI + side * 0.5;
        return `${(x2 + Math.cos(a) * 6).toFixed(1)},${(y2 + Math.sin(a) * 6).toFixed(1)}`;
    };
    return {
        path,
        head: `${wing(-1)} ${x2.toFixed(1)},${y2.toFixed(1)} ${wing(1)}`,
    };
}

const RINGS: Record<Axis, { path: string; head: string }> = {
    x: ring("x"),
    y: ring("y"),
    z: ring("z"),
};

export default function AxisPreview({ active }: { active: Axis | null }) {
    // The axis pointing away from the viewer draws first, so the nearer ones sit on top
    const order = (["x", "y", "z"] as Axis[]).sort(
        (a, b) => thumbnailView(...UNIT[a])[2] - thumbnailView(...UNIT[b])[2],
    );
    return (
        <svg
            width={SIZE}
            height={SIZE}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="pointer-events-none absolute bottom-0 left-0"
            aria-hidden
            data-testid="model-import-axes"
            data-active={active ?? undefined}
        >
            {order.map((axis) => {
                const [x, y] = toPx(UNIT[axis], LENGTH);
                // The letter a fixed distance past the end, so a foreshortened axis's letter
                // still clears the ring
                const along = Math.hypot(x - CENTER, y - CENTER) || 1;
                const lx = x + ((x - CENTER) / along) * LABEL_GAP;
                const ly = y + ((y - CENTER) / along) * LABEL_GAP;
                const faded = active !== null && active !== axis;
                return (
                    <g
                        key={axis}
                        className={clsx(
                            "transition-opacity duration-150",
                            faded && "opacity-25",
                        )}
                        stroke={AXIS_COLORS[axis]}
                        fill={AXIS_COLORS[axis]}
                    >
                        <line
                            x1={CENTER}
                            y1={CENTER}
                            x2={x}
                            y2={y}
                            strokeWidth={active === axis ? 3.5 : 2.5}
                            strokeLinecap="round"
                        />
                        <text
                            x={lx}
                            y={ly}
                            stroke="none"
                            fontSize={13}
                            fontWeight={600}
                            textAnchor="middle"
                            dominantBaseline="central"
                        >
                            {axis.toUpperCase()}
                        </text>
                    </g>
                );
            })}
            {active && (
                <g
                    stroke={AXIS_COLORS[active]}
                    fill="none"
                    strokeWidth={2.25}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    data-testid="model-import-axes-ring"
                >
                    <path d={RINGS[active].path} />
                    <polyline points={RINGS[active].head} />
                </g>
            )}
        </svg>
    );
}
