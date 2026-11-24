import { describe, expect, it } from "vitest";
import en from "../../../../../i18n/en.json";
import type { Fix, Note, Refusal } from "../../types";
import { canRetry, fixText, noteText, refusalText } from "../reportText";

/** Fails on a key en.json doesn't have, so every code has words */
const t = (key: string) => {
    const text = key
        .split(".")
        .reduce<unknown>(
            (node, part) => (node as Record<string, unknown>)?.[part],
            en,
        );
    if (typeof text !== "string") throw new Error(`No text for ${key}`);
    return key;
};

const REFUSALS: Refusal[] = [
    { code: "noModelFile", names: [] },
    { code: "severalModelFiles", names: ["a.glb", "b.glb"] },
    { code: "tooLarge", bytes: 300 * 1024 * 1024, limit: 200 * 1024 * 1024 },
    { code: "unreadable", reason: "bad header" },
    { code: "externalUri", uri: "https://x/y.bin" },
    { code: "outsidePickedFiles", uri: "../y.bin" },
    { code: "missingFile", uri: "y.bin" },
    { code: "requiredExtension", extensions: ["EXT_x"] },
    {
        code: "validatorErrors",
        count: 2,
        messages: [{ code: "A", message: "Broken", pointer: null }],
    },
    {
        code: "imageTooLarge",
        image: "a.png",
        width: 9000,
        height: 9000,
        limit: 8192,
    },
    { code: "imageUnreadable", image: "a.png" },
    { code: "tooManyTriangles", triangles: 90000, cap: 20000, limit: 80000 },
    { code: "rigged" },
    { code: "noGeometry" },
    { code: "timedOut", seconds: 120 },
    { code: "failed", reason: "out of memory" },
];

const FIXES: Fix[] = [
    {
        code: "texturesShrunk",
        cap: 1024,
        textures: [{ name: "wood", from: [2048, 2048], to: [1024, 1024] }],
    },
    { code: "dracoDecoded" },
    { code: "meshoptDecoded" },
    { code: "instancesExpanded" },
    { code: "extensionsDropped", extensions: ["KHR_x"] },
    {
        code: "contentDropped",
        animations: 1,
        cameras: 1,
        morphTargets: 1,
        scenes: 1,
    },
    { code: "pivotMoved", offsetM: [0, 0.1, 0] },
];

const NOTES: Note[] = [
    { code: "validatorWarnings", count: 3 },
    { code: "sizeOutOfRange", largestM: 40, minM: 0.1, maxM: 20 },
    { code: "overTriangleCap", triangles: 25000, cap: 20000 },
];

describe("the import report's words", () => {
    it.each(REFUSALS.map((r) => [r.code, r] as const))(
        "says why %s can't be imported",
        (_code, refusal) => {
            expect(refusalText(refusal, t).title).toBeTruthy();
        },
    );
    it.each(FIXES.map((f) => [f.code, f] as const))(
        "says what %s fixed",
        (_code, fix) => {
            expect(fixText(fix, t).title).toBeTruthy();
        },
    );
    it.each(NOTES.map((n) => [n.code, n] as const))(
        "notes %s",
        (_code, note) => {
            expect(noteText(note, t, String).title).toBeTruthy();
        },
    );

    it("writes an odd size's lengths with the length it's given", () => {
        const say = (key: string, params?: Record<string, string | number>) =>
            `${key} ${JSON.stringify(params ?? {})}`;
        const note: Note = {
            code: "sizeOutOfRange",
            largestM: 40,
            minM: 0.1,
            maxM: 20,
        };
        expect(noteText(note, say, (m) => `<${m}>`).detail).toContain(
            '"largest":"<40>","min":"<0.1>","max":"<20>"',
        );
    });

    it("offers Try again only when the import failed, not the file", () => {
        expect(REFUSALS.filter(canRetry).map((r) => r.code)).toEqual([
            "timedOut",
            "failed",
        ]);
    });
});
