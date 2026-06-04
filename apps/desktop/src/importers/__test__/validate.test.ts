import { describe, it, expect } from "vitest";
import { validateManifest } from "../validate";
import type { ImportManifest } from "../types";

function baseManifest(overrides: Partial<ImportManifest> = {}): ImportManifest {
    return {
        source: { format: "test", filename: "test.pdf" },
        marchers: [
            { key: "s-1", drillPrefix: "S", drillOrder: 1 },
            { key: "s-2", drillPrefix: "S", drillOrder: 2 },
        ],
        sets: [
            { setId: "0", counts: 0, order: 0 },
            { setId: "1", counts: 32, order: 1 },
        ],
        positions: [
            { marcherKey: "s-1", setId: "0", xSteps: 0, ySteps: 0 },
            { marcherKey: "s-1", setId: "1", xSteps: 4, ySteps: -28 },
            { marcherKey: "s-2", setId: "0", xSteps: 8, ySteps: 0 },
            { marcherKey: "s-2", setId: "1", xSteps: 12, ySteps: -28 },
        ],
        ...overrides,
    };
}

const defaultBounds = {
    xCheckpoints: [{ stepsFromCenterFront: -80 }, { stepsFromCenterFront: 80 }],
    yCheckpoints: [{ stepsFromCenterFront: 0 }, { stepsFromCenterFront: -84 }],
};

describe("validateManifest", () => {
    it("returns no issues for a valid manifest", () => {
        const report = validateManifest(baseManifest(), defaultBounds);
        expect(report.issues).toHaveLength(0);
        expect(report.stats.marchers).toBe(2);
        expect(report.stats.sets).toBe(2);
        expect(report.stats.positions).toBe(4);
    });

    it("detects DUPLICATE_LABEL", () => {
        const manifest = baseManifest({
            marchers: [
                { key: "s-1", drillPrefix: "S", drillOrder: 1 },
                { key: "S-1", drillPrefix: "S", drillOrder: 2 },
            ],
        });
        const report = validateManifest(manifest, defaultBounds);
        expect(report.issues.some((i) => i.code === "DUPLICATE_LABEL")).toBe(
            true,
        );
    });

    it("detects SET_MISMATCH when marchers have different set lists", () => {
        const manifest = baseManifest({
            positions: [
                { marcherKey: "s-1", setId: "0", xSteps: 0, ySteps: 0 },
                { marcherKey: "s-1", setId: "1", xSteps: 4, ySteps: -28 },
                { marcherKey: "s-2", setId: "0", xSteps: 8, ySteps: 0 },
                { marcherKey: "s-2", setId: "2", xSteps: 12, ySteps: -28 },
            ],
        });
        const report = validateManifest(manifest, defaultBounds);
        expect(report.issues.some((i) => i.code === "SET_MISMATCH")).toBe(true);
    });

    it("detects OUT_OF_BOUNDS positions", () => {
        const manifest = baseManifest({
            positions: [
                { marcherKey: "s-1", setId: "0", xSteps: 200, ySteps: 0 },
            ],
        });
        const report = validateManifest(manifest, defaultBounds);
        expect(report.issues.some((i) => i.code === "OUT_OF_BOUNDS")).toBe(
            true,
        );
    });

    it("detects LATERAL_PARSE_FAILED for NaN xSteps", () => {
        const manifest = baseManifest({
            positions: [
                { marcherKey: "s-1", setId: "0", xSteps: NaN, ySteps: 0 },
            ],
        });
        const report = validateManifest(manifest, defaultBounds);
        expect(
            report.issues.some((i) => i.code === "LATERAL_PARSE_FAILED"),
        ).toBe(true);
    });

    it("detects FB_PARSE_FAILED for NaN ySteps", () => {
        const manifest = baseManifest({
            positions: [
                { marcherKey: "s-1", setId: "0", xSteps: 0, ySteps: NaN },
            ],
        });
        const report = validateManifest(manifest, defaultBounds);
        expect(report.issues.some((i) => i.code === "FB_PARSE_FAILED")).toBe(
            true,
        );
    });

    it("warns on LOW_CONFIDENCE", () => {
        const manifest = baseManifest({
            positions: [
                {
                    marcherKey: "s-1",
                    setId: "0",
                    xSteps: 0,
                    ySteps: 0,
                    confidence: 0.2,
                },
            ],
        });
        const report = validateManifest(manifest, defaultBounds);
        const lc = report.issues.find((i) => i.code === "LOW_CONFIDENCE");
        expect(lc).toBeDefined();
        expect(lc!.type).toBe("warning");
    });

    it("detects MISSING_CRITICAL for empty setId", () => {
        const manifest = baseManifest({
            positions: [{ marcherKey: "s-1", setId: "", xSteps: 0, ySteps: 0 }],
        });
        const report = validateManifest(manifest, defaultBounds);
        expect(report.issues.some((i) => i.code === "MISSING_CRITICAL")).toBe(
            true,
        );
    });

    it("uses default bounds when none provided", () => {
        const report = validateManifest(baseManifest());
        expect(report.issues).toHaveLength(0);
    });
});
