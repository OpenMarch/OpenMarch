import type { ToolChoicePicture } from "../tool/toolKind";
import type { XY } from "../types";

/**
 * Fitting an answer's sketch (#559) into the menu's picture. Everything here is pure.
 */

/** The pictures' size, in CSS px and their own units: the mode menu's (`modePictures`) */
export const CHOICE_PICTURE = { width: 24, height: 16 } as const;
/** Room left at the picture's edges, so dots and line ends aren't cut off */
const PAD = 2;

/** `picture` scaled into {@link CHOICE_PICTURE}, centered, keeping its proportions */
export function fitChoicePicture(
    picture: ToolChoicePicture,
): ToolChoicePicture {
    const all = [
        ...picture.dots,
        ...(picture.faintDots ?? []),
        ...picture.lines.flatMap((line) => line.points),
    ];
    if (all.length === 0) return picture;
    const xs = all.map((p) => p.x);
    const ys = all.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const width = Math.max(...xs) - minX;
    const depth = Math.max(...ys) - minY;
    const { width: W, height: H } = CHOICE_PICTURE;
    const k = Math.min(
        width > 0 ? (W - 2 * PAD) / width : Infinity,
        depth > 0 ? (H - 2 * PAD) / depth : Infinity,
    );
    const scale = Number.isFinite(k) ? k : 0;
    const offsetX = (W - width * scale) / 2;
    const offsetY = (H - depth * scale) / 2;
    const place = ({ x, y }: XY): XY => ({
        x: offsetX + (x - minX) * scale,
        y: offsetY + (y - minY) * scale,
    });
    return {
        lines: picture.lines.map((line) => ({
            ...line,
            points: line.points.map(place),
        })),
        dots: picture.dots.map(place),
        ...(picture.faintDots
            ? { faintDots: picture.faintDots.map(place) }
            : {}),
    };
}
