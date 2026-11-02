import type { DistributionMode } from "../distribute/distribution";

/**
 * The mode menu's pictures (#435): one hand-drawn example of each mode that every kind shares
 * (owner: one clear example, not one per shape). The same box frame in each, so only the fill
 * changes: Grid fills it in rows and files, Outline runs round its edge and leaves the middle
 * empty, and Spread scatters evenly over all of it with no rows (placed by hand so it reads that
 * way at this size).
 */

/** The pictures' size, in CSS px and their own units */
export const MODE_PICTURE = { width: 24, height: 16 } as const;

type Dot = readonly [x: number, y: number];

/** The frame every picture shares */
const FRAME = { x: 1.5, y: 1.5, width: 21, height: 13 } as const;

const GRID: readonly Dot[] = [5, 9.67, 14.33, 19].flatMap((x) =>
    [4.5, 8, 11.5].map((y): Dot => [x, y]),
);

const OUTLINE: readonly Dot[] = [
    [4, 4],
    [9.33, 4],
    [14.67, 4],
    [20, 4],
    [20, 8],
    [20, 12],
    [14.67, 12],
    [9.33, 12],
    [4, 12],
    [4, 8],
];

const SPREAD: readonly Dot[] = [
    [3.9, 4.6],
    [8.8, 3.4],
    [14, 5.3],
    [19.6, 3.6],
    [6, 8.6],
    [10.9, 7.9],
    [16.9, 8.9],
    [20.4, 11.9],
    [3.6, 12.2],
    [9, 12.6],
    [13.6, 11.6],
    [16.8, 12.6],
];

const DOTS: Record<DistributionMode, readonly Dot[]> = {
    files: GRID,
    outline: OUTLINE,
    spread: SPREAD,
};

/** A mode's example: its dots in the shared frame */
export function ModePicture({
    mode,
    testId = `shape-mode-preview-${mode}`,
}: {
    mode: DistributionMode;
    testId?: string;
}) {
    const { width, height } = MODE_PICTURE;
    return (
        <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            aria-hidden
            focusable={false}
            className="shrink-0"
            data-testid={testId}
            data-spots={DOTS[mode].length}
        >
            <rect
                {...FRAME}
                rx={1}
                fill="none"
                stroke="currentColor"
                strokeOpacity={0.35}
                strokeWidth={0.75}
            />
            {DOTS[mode].map(([x, y], i) => (
                <circle key={i} cx={x} cy={y} r={1.1} fill="currentColor" />
            ))}
        </svg>
    );
}
