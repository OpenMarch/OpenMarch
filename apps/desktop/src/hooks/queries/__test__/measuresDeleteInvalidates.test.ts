import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

vi.mock("@/App", () => ({ queryClient: undefined }));

const { deleteMeasuresAndBeatsMutationOptions } =
    await import("../useMeasures");
const { cueKeys } = await import("../useCues");
const { itemGeometryKeys } = await import("../useItems");

/*
 * Deleting measures deletes their beats through `deleteBeatsCarryingItemChangesInTransaction`,
 * which moves the deleted beats' cues and item Outline changes to other beats. Their queries never
 * go stale on their own (`DEFAULT_STALE_TIME` is Infinity), so the mutation must refresh them.
 */
describe("deleting measures and beats", () => {
    it("refreshes the cue and item geometry queries", () => {
        const qc = new QueryClient();
        const invalidate = vi
            .spyOn(qc, "invalidateQueries")
            .mockResolvedValue(undefined);
        const options = deleteMeasuresAndBeatsMutationOptions(qc);

        void options.onSettled?.(
            undefined,
            null,
            new Set([1]),
            undefined,
            // The mutation function context is not read by onSettled.
            undefined as never,
        );

        const keys = invalidate.mock.calls.map(
            ([filters]) => filters?.queryKey,
        );
        expect(keys).toContainEqual(cueKeys.all());
        expect(keys).toContainEqual(itemGeometryKeys.all());
    });
});
