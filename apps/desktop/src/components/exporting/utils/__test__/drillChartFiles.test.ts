import { describe, expect, it } from "vitest";
import {
    makeDrillChartFiles,
    type DrillChartPdfResult,
} from "../drillChartFiles";

/** Runs the PDF loop with each PDF's answer given in order, recording what it reports */
const run = async ({
    individualCharts,
    answers,
    skipped = [],
    cancelAfter,
}: {
    individualCharts: boolean;
    /** Per PDF: a result, or an Error the IPC call rejects with */
    answers: (DrillChartPdfResult | Error)[];
    skipped?: number[];
    cancelAfter?: number;
}) => {
    const failed: [number, string][] = [];
    const attempted: number[] = [];
    const progressed: number[] = [];
    const settled = await makeDrillChartFiles({
        count: answers.length,
        individualCharts,
        skipReason: (i) => (skipped.includes(i) ? "no positions" : undefined),
        makePdf: async (i) => {
            attempted.push(i);
            const answer = answers[i];
            if (answer instanceof Error) throw answer;
            return answer;
        },
        onFailed: (i, reason) => failed.push([i, reason]),
        onAttempted: (i) => progressed.push(i),
        isCancelled: () =>
            cancelAfter !== undefined && progressed.includes(cancelAfter),
        cancelledMessage: "cancelled",
        noneMadeMessage: "none made",
        unknownErrorMessage: "unknown",
    }).then(
        (count) => ({ count, error: undefined }),
        (error: Error) => ({ count: undefined, error: error.message }),
    );
    return { ...settled, failed, attempted, progressed };
};

describe("makeDrillChartFiles", () => {
    describe("one combined chart", () => {
        it("returns 1 when the PDF saves", async () => {
            const { count, error, attempted } = await run({
                individualCharts: false,
                answers: [{ success: true }, { success: true }],
            });
            expect(error).toBeUndefined();
            expect(count).toBe(1);
            expect(attempted).toEqual([0]);
        });

        it("fails with the reason when the PDF answers success: false", async () => {
            const { error, failed } = await run({
                individualCharts: false,
                answers: [{ success: false, error: "ENOSPC: no space left" }],
            });
            expect(error).toBe("ENOSPC: no space left");
            // The caller's failure notification is the only one
            expect(failed).toEqual([]);
        });

        it("fails with the reason, without Electron's prefix, when saving throws", async () => {
            const { error } = await run({
                individualCharts: false,
                answers: [
                    new Error(
                        "Error invoking remote method 'export:generateDocForMarcher': Error: EACCES: permission denied, open '/x/Show-MAIN.pdf'",
                    ),
                ],
            });
            expect(error).toBe(
                "EACCES: permission denied, open '/x/Show-MAIN.pdf'",
            );
        });

        it("falls back to the unknown-error text when no reason is given", async () => {
            const { error } = await run({
                individualCharts: false,
                answers: [{ success: false }],
            });
            expect(error).toBe("unknown");
        });
    });

    describe("individual charts", () => {
        it("counts the PDFs made and reports each failure, then succeeds", async () => {
            const { count, error, failed, attempted, progressed } = await run({
                individualCharts: true,
                answers: [
                    { success: true },
                    { success: false, error: "file is open" },
                    { success: true },
                    { success: true },
                ],
                skipped: [3],
            });
            expect(error).toBeUndefined();
            expect(count).toBe(2);
            expect(failed).toEqual([
                [1, "file is open"],
                [3, "no positions"],
            ]);
            // A skipped marcher isn't tried
            expect(attempted).toEqual([0, 1, 2]);
            // Progress moves on for failed charts too, not for skipped ones
            expect(progressed).toEqual([0, 1, 2]);
        });

        it("stops at the first save error with its reason, even after charts were made", async () => {
            const { error, failed, attempted } = await run({
                individualCharts: true,
                answers: [
                    { success: true },
                    new Error(
                        "Error invoking remote method 'export:generateDocForMarcher': Error: ENOSPC: no space left on device",
                    ),
                    { success: true },
                ],
            });
            expect(error).toBe("ENOSPC: no space left on device");
            // One failure notification from the caller, none per marcher
            expect(failed).toEqual([]);
            expect(attempted).toEqual([0, 1]);
        });

        it("fails when there are no marchers to chart", async () => {
            const { error, attempted } = await run({
                individualCharts: true,
                answers: [],
            });
            expect(error).toBe("none made");
            expect(attempted).toEqual([]);
        });

        it("fails when no PDF was made", async () => {
            const { error, failed } = await run({
                individualCharts: true,
                answers: [
                    { success: false, error: "ENOSPC" },
                    { success: false },
                ],
            });
            expect(error).toBe("none made");
            expect(failed).toEqual([
                [0, "ENOSPC"],
                [1, "unknown"],
            ]);
        });

        it("fails when every marcher was skipped", async () => {
            const { error, attempted } = await run({
                individualCharts: true,
                answers: [{ success: true }, { success: true }],
                skipped: [0, 1],
            });
            expect(error).toBe("none made");
            expect(attempted).toEqual([]);
        });

        it("stops with the cancelled message when cancelled", async () => {
            const { error, attempted } = await run({
                individualCharts: true,
                answers: [{ success: true }, { success: true }],
                cancelAfter: 0,
            });
            expect(error).toBe("cancelled");
            expect(attempted).toEqual([0]);
        });
    });
});
