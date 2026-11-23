import { beforeEach, describe, expect, it } from "vitest";
import {
    keepMirrorPoint,
    lastMirrorPoint,
    MIRROR_POINT_STORAGE_KEY,
    startingMirrorPoint,
} from "../clipboard/mirrorPointStore";

/** Where Paste mirrored opens its mirror point, and the point it remembers */

const W = 1600;
const H = 850;
const snap = (p: { x: number; y: number }) => ({
    x: Math.round(p.x / 5) * 5,
    y: Math.round(p.y / 5) * 5,
});

describe("the remembered mirror point", () => {
    beforeEach(() => localStorage.clear());

    it("reads back the point kept for this field size", () => {
        expect(lastMirrorPoint(W, H)).toBeNull();
        keepMirrorPoint({ x: 640, y: 300 }, W, H);
        expect(lastMirrorPoint(W, H)).toEqual({ x: 640, y: 300 });
    });

    it("ignores a point from a field of another size", () => {
        keepMirrorPoint({ x: 640, y: 300 }, W, H);
        expect(lastMirrorPoint(W + 10, H)).toBeNull();
    });

    it("ignores a point off the field, or anything it can't read", () => {
        keepMirrorPoint({ x: W + 1, y: 300 }, W, H);
        expect(lastMirrorPoint(W, H)).toBeNull();
        localStorage.setItem(MIRROR_POINT_STORAGE_KEY, "{not json");
        expect(lastMirrorPoint(W, H)).toBeNull();
        localStorage.setItem(
            MIRROR_POINT_STORAGE_KEY,
            JSON.stringify({ x: "1", y: 2, width: W, height: H }),
        );
        expect(lastMirrorPoint(W, H)).toBeNull();
    });
});

describe("where Paste mirrored opens its mirror point", () => {
    const copied = [
        { x: 300, y: 200 },
        { x: 360, y: 260 },
    ];
    const field = { width: W, height: H, centerX: 800, snap };

    it("on the 50, level with the copy, the first time", () => {
        expect(startingMirrorPoint({ ...field, last: null, copied })).toEqual({
            x: 800,
            y: 230,
        });
    });

    it("where the last one was, while the mirror image stays on the field", () => {
        const last = { x: 640, y: 100 };
        expect(startingMirrorPoint({ ...field, last, copied })).toEqual(last);
    });

    it("on the 50 when the last point would put the mirror image off the field", () => {
        // Mirrored through x 1200, the copy at 300 lands at 2100, past the end of the field
        const last = { x: 1200, y: 100 };
        expect(startingMirrorPoint({ ...field, last, copied })).toEqual({
            x: 800,
            y: 230,
        });
    });
});
