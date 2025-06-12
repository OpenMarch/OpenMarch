import { MarcherCoord } from "./index";
import { lusolve } from "mathjs";

export type ShapeType = "line" | "circle" | "block" | "irregular";

/**
 * Classifies a group of marchers into a shape type based on their arrangement.
 * Uses PCA and geometric analysis to determine the most likely shape.
 *
 * @param marchers - Array of marcher coordinates to analyze
 * @returns The classified shape type
 */
export function classifyShape(marchers: MarcherCoord[]): ShapeType {
    if (marchers.length < 3) return "irregular";

    const points = marchers.map((m) => [m.coordinate.x, m.coordinate.y]);

    const pcaRatio = getPCARatio(points);
    if (pcaRatio > 0.95) return "line"; // Highly directional = line

    const circleResidual = fitCircleResidual(points);
    if (circleResidual < 1.0) return "circle";

    const aspectRatio = getBoundingBoxAspectRatio(points);
    if (aspectRatio > 0.75 && aspectRatio < 1.33) return "block";

    return "irregular";
}

/**
 * Calculates the ratio of principal components to determine linearity.
 * A high ratio indicates a strong linear arrangement.
 */
function getPCARatio(points: number[][]): number {
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const meanX = mean(xs);
    const meanY = mean(ys);

    const centered = points.map(([x, y]) => [x - meanX, y - meanY]);
    const covXX = mean(centered.map(([x]) => x * x));
    const covYY = mean(centered.map(([, y]) => y * y));
    const covXY = mean(centered.map(([x, y]) => x * y));

    const trace = covXX + covYY;
    const det = covXX * covYY - covXY * covXY;
    const eigen1 = trace / 2 + Math.sqrt((trace * trace) / 4 - det);
    const eigen2 = trace / 2 - Math.sqrt((trace * trace) / 4 - det);

    return eigen1 / (eigen1 + eigen2);
}

/**
 * Fits a circle to the points and returns the average residual.
 * A low residual indicates a good circular fit.
 */
function fitCircleResidual(points: number[][]): number {
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);

    const A = xs.map((x, i) => [2 * x, 2 * ys[i], 1]);
    const b = xs.map((x, i) => x * x + ys[i] * ys[i]);

    const AT = transpose(A);
    const ATA = multiply(AT, A);
    const ATb = multiply(
        AT,
        b.map((v) => [v]),
    );
    const sol = solve3x3(ATA, ATb);

    const [xc, yc, c] = sol.map((row) => row[0]);
    const r = Math.sqrt(c + xc * xc + yc * yc);

    const residuals = points.map(([x, y]) =>
        Math.abs(Math.sqrt((x - xc) ** 2 + (y - yc) ** 2) - r),
    );
    return mean(residuals);
}

/**
 * Calculates the aspect ratio of the bounding box containing all points.
 * A ratio close to 1 indicates a square/block arrangement.
 */
function getBoundingBoxAspectRatio(points: number[][]): number {
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);
    if (height === 0) return Infinity;
    return width / height;
}

// Helper functions
function mean(arr: number[]): number {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function transpose(m: number[][]): number[][] {
    return m[0].map((_, i) => m.map((row) => row[i]));
}

function multiply(a: number[][], b: number[][]): number[][] {
    const result = Array.from({ length: a.length }, () =>
        Array(b[0].length).fill(0),
    );
    for (let i = 0; i < a.length; i++) {
        for (let j = 0; j < b[0].length; j++) {
            for (let k = 0; k < b.length; k++) {
                result[i][j] += a[i][k] * b[k][j];
            }
        }
    }
    return result;
}

function solve3x3(a: number[][], b: number[][]): number[][] {
    return lusolve(a, b) as number[][];
}
