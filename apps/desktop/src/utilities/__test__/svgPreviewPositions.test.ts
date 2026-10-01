import { describe, expect, it, vi } from "vitest";
import type { Resolver } from "@openmarch/core";
import type Page from "@/global/classes/Page";
import { timelinePreviewPositions } from "../svgPreviewPositions";

/** The launch-page preview in timeline mode (docs/timeline/phases/07-page-parity.md P7.7). */

const page = { id: 4, beats: [{ index: 1 }, { index: 2 }] } as unknown as Page;

const resolver = (positionsAt: Resolver["positionsAt"]) =>
    ({ marcherIds: () => [7], positionsAt }) as unknown as Resolver;

describe("timelinePreviewPositions", () => {
    it("samples a ready resolver at the page's end beat", async () => {
        const positionsAt = vi.fn((_beat: number, out: Float64Array) => {
            out[0] = 10;
            out[1] = 20;
        });

        const map = await timelinePreviewPositions(
            { status: "ready", resolver: resolver(positionsAt) },
            page,
        );

        expect(positionsAt).toHaveBeenCalledWith(3, expect.any(Float64Array));
        expect(map?.marcherPagesByPage[4]?.[7]).toEqual({
            marcher_id: 7,
            page_id: 4,
            x: 10,
            y: 20,
        });
    });

    it("returns undefined at once without a resolver", async () => {
        expect(
            await timelinePreviewPositions(
                { status: "ready", resolver: null },
                page,
            ),
        ).toBeUndefined();
    });

    it.each(["loading", "error", "off"] as const)(
        "returns undefined at once when the status is %s",
        async (status) => {
            const positionsAt = vi.fn();
            expect(
                await timelinePreviewPositions(
                    { status, resolver: resolver(positionsAt) },
                    page,
                ),
            ).toBeUndefined();
            expect(positionsAt).not.toHaveBeenCalled();
        },
    );

    it("returns undefined when sampling throws", async () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        try {
            expect(
                await timelinePreviewPositions(
                    {
                        status: "ready",
                        resolver: resolver(() => {
                            throw new Error("boom");
                        }),
                    },
                    page,
                ),
            ).toBeUndefined();
            expect(error).toHaveBeenCalled();
        } finally {
            error.mockRestore();
        }
    });
});
