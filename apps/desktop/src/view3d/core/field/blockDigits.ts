/**
 * Block numerals for painted yard numbers: the heavy, square-shouldered
 * digits football fields are lettered with, 4 ft wide by 6 ft tall, with
 * narrow slot counters. Drawn from outlines rather than a font so they keep
 * the field's proportions whatever font the system has.
 *
 * Each digit is drawn on a 4 x 6 grid (feet, y down from the glyph's top)
 * with stems 1.4 wide and bars 1.07 tall, from the stadium turf drawings.
 * Outlines run clockwise and counters counterclockwise on screen,
 * so one nonzero fill cuts the counters out.
 */

type Point = readonly [number, number];
type Ring = readonly Point[];

interface BlockGlyph {
    outer: Ring[];
    holes: Ring[];
}

export const BLOCK_GRID = { width: 4, height: 6 } as const;

const rect = (x0: number, y0: number, x1: number, y1: number): Ring => [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
];

/** Stem width and bar height, from the turf drawings' yard-line marker. */
const S = 1.4;
const B = 1.07;
/** The middle bar of 2, 3, 5, 6, 8 and 9, centered. */
const M0 = 3 - B / 2;
const M1 = 3 + B / 2;
/** The 45-degree cut on the numerals' outer corners (the drawings' 0). */
const CUT = 0.6;

/**
 * `ring` with the corners at `at` cut off by `CUT` along both edges, as the
 * drawings cut the 0's corners.
 */
function chamfer(ring: Ring, at: readonly Point[]): Ring {
    const out: Point[] = [];
    ring.forEach((p, i) => {
        if (!at.some(([x, y]) => x === p[0] && y === p[1])) {
            out.push(p);
            return;
        }
        const toward = (q: Point): Point => {
            const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
            const t = Math.min(CUT, len / 2) / len;
            return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
        };
        out.push(toward(ring[(i + ring.length - 1) % ring.length]));
        out.push(toward(ring[(i + 1) % ring.length]));
    });
    return out;
}

const BOX = rect(0, 0, 4, 6);
const CORNERS: Point[] = [
    [0, 0],
    [4, 0],
    [4, 6],
    [0, 6],
];

/**
 * The 0 and the 4 are traced from the drawings' yard-line marker detail
 * (Lucas Oil Stadium turf drawings, detail 2): sharp corners, the 0's four
 * corners cut, its slot rounded; the 4 4 ft 3.8 in wide, the extra width on
 * its slanted side (x < 0, away from the yard line), with notched serifs and
 * a sharp triangle counter. The other numerals follow the same stems, bars
 * and cut corners.
 */
const GLYPHS: Record<string, BlockGlyph> = {
    "0": {
        outer: [chamfer(BOX, CORNERS)],
        holes: [rect(S, B, 4 - S, 6 - B)],
    },
    "1": {
        outer: [
            [
                [0.7, 0],
                [3.1, 0],
                [3.1, 6],
                [3.1 - S, 6],
                [3.1 - S, B],
                [0.7, B],
            ],
        ],
        holes: [],
    },
    "2": {
        outer: [
            chamfer(
                [
                    [0, 0],
                    [4, 0],
                    [4, M1],
                    [S, M1],
                    [S, 6 - B],
                    [4, 6 - B],
                    [4, 6],
                    [0, 6],
                    [0, M0],
                    [4 - S, M0],
                    [4 - S, B],
                    [0, B],
                ],
                [
                    [0, 0],
                    [4, 0],
                    [4, M1],
                ],
            ),
        ],
        holes: [],
    },
    "3": {
        outer: [
            chamfer(
                [
                    [0, 0],
                    [4, 0],
                    [4, 6],
                    [0, 6],
                    [0, 6 - B],
                    [4 - S, 6 - B],
                    [4 - S, M1],
                    [0.9, M1],
                    [0.9, M0],
                    [4 - S, M0],
                    [4 - S, B],
                    [0, B],
                ],
                CORNERS,
            ),
        ],
        holes: [],
    },
    "4": {
        outer: [
            [
                [1.1, 0],
                [4, 0],
                [4, 1.07],
                [3.54, 1.07],
                [3.54, 3.16],
                [4, 3.16],
                [4, 4.26],
                [3.54, 4.26],
                [3.54, 4.95],
                [4, 4.95],
                [4, 6],
                [1.66, 6],
                [1.66, 4.95],
                [2.17, 4.95],
                [2.17, 4.26],
                [0.22, 4.26],
                [-0.32, 3.5],
            ],
        ],
        holes: [
            [
                [2.17, 1.07],
                [2.17, 3.16],
                [1.19, 3.16],
            ],
        ],
    },
    "5": {
        outer: [
            chamfer(
                [
                    [0, 0],
                    [4, 0],
                    [4, B],
                    [S, B],
                    [S, M0],
                    [4, M0],
                    [4, 6],
                    [0, 6],
                    [0, 6 - B],
                    [4 - S, 6 - B],
                    [4 - S, M1],
                    [0, M1],
                ],
                [
                    [4, M0],
                    [4, 6],
                    [0, 6],
                ],
            ),
        ],
        holes: [],
    },
    "6": {
        outer: [
            chamfer(
                [
                    [0, 0],
                    [4, 0],
                    [4, B],
                    [S, B],
                    [S, M0],
                    [4, M0],
                    [4, 6],
                    [0, 6],
                ],
                [
                    [0, 0],
                    [4, M0],
                    [4, 6],
                    [0, 6],
                ],
            ),
        ],
        holes: [rect(S, M1, 4 - S, 6 - B)],
    },
    "7": {
        outer: [
            chamfer(
                [
                    [0, 0],
                    [4, 0],
                    [4, B],
                    [2.95, 6],
                    [2.95 - S, 6],
                    [2.5, B],
                    [0, B],
                ],
                [[0, 0]],
            ),
        ],
        holes: [],
    },
    "8": {
        outer: [chamfer(BOX, CORNERS)],
        holes: [rect(S, B, 4 - S, M0), rect(S, M1, 4 - S, 6 - B)],
    },
    "9": {
        outer: [
            chamfer(
                [
                    [0, 0],
                    [4, 0],
                    [4, 6],
                    [0, 6],
                    [0, 6 - B],
                    [4 - S, 6 - B],
                    [4 - S, M1],
                    [0, M1],
                ],
                [
                    [0, 0],
                    [4, 0],
                    [4, 6],
                    [0, M1],
                ],
            ),
        ],
        holes: [rect(S, B, 4 - S, M0)],
    },
};

/**
 * Corner rounding, in grid feet: the drawings' corners are sharp (a hair
 * of rounding keeps them clean), the slots' rounded.
 */
const OUTER_RADIUS = 0.04;
const HOLE_RADIUS = 0.25;

/**
 * How far a numeral reaches past its 4 ft cell on the side away from the
 * yard line, in shares of its height (the 4's slanted side), else 0.
 */
export function blockOverhang(char: string): number {
    const glyph = GLYPHS[char];
    if (!glyph) return 0;
    const minX = Math.min(...glyph.outer.flat().map(([x]) => x));
    return Math.max(0, -minX) / BLOCK_GRID.height;
}

/** Whether every character of `text` has a block numeral. */
export function hasBlockGlyphs(text: string): boolean {
    return text.length > 0 && [...text].every((c) => c in GLYPHS);
}

/** Twice the signed area of a ring; positive runs clockwise on screen. */
function area2(ring: Ring): number {
    let a = 0;
    ring.forEach(([x0, y0], i) => {
        const [x1, y1] = ring[(i + 1) % ring.length];
        a += x0 * y1 - x1 * y0;
    });
    return a;
}

/** Adds `ring` to the path with rounded corners, in the wanted direction. */
function addRing(
    g: CanvasRenderingContext2D,
    ring: Ring,
    clockwise: boolean,
    radius: number,
    k: number,
    ox: number,
    oy: number,
): void {
    const runsClockwise = area2(ring) > 0;
    const pts = runsClockwise === clockwise ? ring : [...ring].reverse();
    const n = pts.length;
    const at = ([x, y]: Point): Point => [ox + x * k, oy + y * k];
    const mid = (a: Point, b: Point): Point => [
        (a[0] + b[0]) / 2,
        (a[1] + b[1]) / 2,
    ];
    const start = at(mid(pts[n - 1], pts[0]));
    g.moveTo(start[0], start[1]);
    for (let i = 0; i < n; i++) {
        const p = pts[i];
        const q = pts[(i + 1) % n];
        const prev = pts[(i + n - 1) % n];
        // Never round more than half of either edge at the corner.
        const room = Math.min(
            Math.hypot(p[0] - prev[0], p[1] - prev[1]),
            Math.hypot(q[0] - p[0], q[1] - p[1]),
        );
        const r = Math.min(radius, room / 2) * k;
        const [cx, cy] = at(p);
        const [nx, ny] = at(mid(p, q));
        g.arcTo(cx, cy, nx, ny, r);
    }
    g.closePath();
}

/**
 * Paints `text` in block numerals, centered on the origin, each digit
 * `height` tall and two thirds as wide with `gap` between digits, glyph tops
 * toward -y. The caller sets the transform and fill style.
 */
export function paintBlockText(
    g: CanvasRenderingContext2D,
    text: string,
    height: number,
    gap: number,
): void {
    const k = height / BLOCK_GRID.height;
    const w = BLOCK_GRID.width * k;
    const chars = [...text];
    const total = chars.length * w + (chars.length - 1) * gap;
    g.beginPath();
    chars.forEach((c, i) => {
        const glyph = GLYPHS[c];
        const ox = -total / 2 + i * (w + gap);
        const oy = -height / 2;
        for (const ring of glyph.outer)
            addRing(g, ring, true, OUTER_RADIUS, k, ox, oy);
        for (const ring of glyph.holes)
            // The 4's triangle counter keeps its points.
            addRing(
                g,
                ring,
                false,
                ring.length === 3 ? OUTER_RADIUS : HOLE_RADIUS,
                k,
                ox,
                oy,
            );
    });
    g.fill("nonzero");
}
