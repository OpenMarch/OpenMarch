import { describe, it, expect } from "vitest";
import { dryRunValidate } from "../dryRun";
import type { NormalizedSheet } from "../types";

function makeSheet(
    overrides: Partial<NormalizedSheet> = {},
    rows: Partial<NormalizedSheet["rows"][0]>[] = [],
): NormalizedSheet {
    return {
        pageIndex: 0,
        quadrant: "TL",
        header: { label: "S1" },
        rows:
            rows.length > 0
                ? rows.map((r) => ({
                      setId: "1",
                      counts: 32,
                      xSteps: 4,
                      ySteps: -28,
                      lateralText: "4 Inside 40 yd ln",
                      fbText: "On Front Hash",
                      ...r,
                  }))
                : [
                      {
                          setId: "1",
                          counts: 32,
                          xSteps: 4,
                          ySteps: -28,
                          lateralText: "4 Inside 40 yd ln",
                          fbText: "On Front Hash",
                      },
                  ],
        ...overrides,
    };
}

const defaultFieldProps = {
    xCheckpoints: [{ stepsFromCenterFront: -80 }, { stepsFromCenterFront: 80 }],
    yCheckpoints: [{ stepsFromCenterFront: 0 }, { stepsFromCenterFront: -84 }],
};

describe("dryRunValidate", () => {
    it("reports no issues for valid sheets", () => {
        const report = dryRunValidate([makeSheet()], defaultFieldProps);
        expect(report.issues).toHaveLength(0);
        expect(report.stats.sheets).toBe(1);
        expect(report.stats.rows).toBe(1);
    });

    it("detects DUPLICATE_LABEL across sheets", () => {
        const sheets = [
            makeSheet({ header: { label: "S1", symbol: "A" } }),
            makeSheet({ header: { label: "S1", symbol: "A" }, pageIndex: 1 }),
        ];
        const report = dryRunValidate(sheets, defaultFieldProps);
        expect(report.issues.some((i) => i.code === "DUPLICATE_LABEL")).toBe(
            true,
        );
    });

    it("detects SET_MISMATCH when sheets have different set lists", () => {
        const sheets = [
            makeSheet({}, [
                {
                    setId: "1",
                    counts: 32,
                    xSteps: 0,
                    ySteps: 0,
                    lateralText: "",
                    fbText: "",
                },
            ]),
            makeSheet({ header: { label: "S2" } }, [
                {
                    setId: "2",
                    counts: 16,
                    xSteps: 0,
                    ySteps: 0,
                    lateralText: "",
                    fbText: "",
                },
            ]),
        ];
        const report = dryRunValidate(sheets, defaultFieldProps);
        expect(report.issues.some((i) => i.code === "SET_MISMATCH")).toBe(true);
    });

    it("surfaces detailed xParseError code instead of generic LATERAL_PARSE_FAILED", () => {
        const sheets = [
            makeSheet({}, [
                {
                    setId: "1",
                    counts: 32,
                    xSteps: NaN,
                    ySteps: -28,
                    lateralText: "garbage",
                    fbText: "On Front Hash",
                    xParseError: "LATERAL_UNRECOGNIZED",
                },
            ]),
        ];
        const report = dryRunValidate(sheets, defaultFieldProps);
        const issue = report.issues.find((i) => i.field === "lateralText");
        expect(issue).toBeDefined();
        expect(issue!.code).toBe("LATERAL_UNRECOGNIZED");
    });

    it("surfaces detailed yParseError code", () => {
        const sheets = [
            makeSheet({}, [
                {
                    setId: "1",
                    counts: 32,
                    xSteps: 4,
                    ySteps: NaN,
                    lateralText: "4 Inside 40",
                    fbText: "garbage",
                    yParseError: "FB_NO_REFERENCE",
                },
            ]),
        ];
        const report = dryRunValidate(sheets, defaultFieldProps);
        const issue = report.issues.find((i) => i.field === "fbText");
        expect(issue).toBeDefined();
        expect(issue!.code).toBe("FB_NO_REFERENCE");
    });

    it("falls back to generic code when no detailed error", () => {
        const sheets = [
            makeSheet({}, [
                {
                    setId: "1",
                    counts: 32,
                    xSteps: NaN,
                    ySteps: NaN,
                    lateralText: "",
                    fbText: "",
                },
            ]),
        ];
        const report = dryRunValidate(sheets, defaultFieldProps);
        expect(
            report.issues.some((i) => i.code === "LATERAL_PARSE_FAILED"),
        ).toBe(true);
        expect(report.issues.some((i) => i.code === "FB_PARSE_FAILED")).toBe(
            true,
        );
    });

    it("detects OUT_OF_BOUNDS", () => {
        const sheets = [
            makeSheet({}, [
                {
                    setId: "1",
                    counts: 32,
                    xSteps: 200,
                    ySteps: 0,
                    lateralText: "test",
                    fbText: "test",
                },
            ]),
        ];
        const report = dryRunValidate(sheets, defaultFieldProps);
        expect(report.issues.some((i) => i.code === "OUT_OF_BOUNDS")).toBe(
            true,
        );
    });

    it("detects MISSING_CRITICAL for missing setId", () => {
        const sheets = [
            makeSheet({}, [
                {
                    setId: "",
                    counts: 32,
                    xSteps: 0,
                    ySteps: 0,
                    lateralText: "test",
                    fbText: "test",
                },
            ]),
        ];
        const report = dryRunValidate(sheets, defaultFieldProps);
        expect(report.issues.some((i) => i.code === "MISSING_CRITICAL")).toBe(
            true,
        );
    });

    it("warns LOW_CONFIDENCE when row conf is low", () => {
        const sheets = [
            makeSheet({}, [
                {
                    setId: "1",
                    counts: 32,
                    xSteps: 0,
                    ySteps: 0,
                    lateralText: "test",
                    fbText: "test",
                    conf: 0.3,
                },
            ]),
        ];
        const report = dryRunValidate(sheets, defaultFieldProps);
        const lc = report.issues.find((i) => i.code === "LOW_CONFIDENCE");
        expect(lc).toBeDefined();
        expect(lc!.type).toBe("warning");
    });

    it("handles empty sheets array", () => {
        const report = dryRunValidate([], defaultFieldProps);
        expect(report.issues).toHaveLength(0);
        expect(report.stats.sheets).toBe(0);
    });
});
