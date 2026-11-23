import { describe, expect, it } from "vitest";
import { keepsLiveFor } from "../pathPenStore";

/**
 * Which writes keep one live group path (review of #900): a loose path stays loose under its
 * edits even once its marchers are a placed shape; only a fresh drawing of exactly a shape's
 * members goes live, and any other group path stays live while its marchers are a shape
 */
describe("keepsLiveFor", () => {
    const shape = () => true;
    const notShape = () => false;

    it("a loose path's edits stay loose, even on a placed shape's members", () => {
        expect(keepsLiveFor(true, false, shape)).toBe(false);
        expect(keepsLiveFor(true, false, notShape)).toBe(false);
    });

    it("a fresh drawing on a placed shape's members goes live; on others it doesn't", () => {
        expect(keepsLiveFor(true, true, shape)).toBe(true);
        expect(keepsLiveFor(false, true, shape)).toBe(true);
        expect(keepsLiveFor(true, true, notShape)).toBe(false);
    });

    it("a live group path stays live only while its marchers are a shape", () => {
        expect(keepsLiveFor(false, false, shape)).toBe(true);
        expect(keepsLiveFor(false, false, notShape)).toBe(false);
    });
});
