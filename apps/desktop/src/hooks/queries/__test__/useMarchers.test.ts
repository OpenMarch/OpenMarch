import { describe, it, expect, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
    createMarchersMutationOptions,
    updateMarchersMutationOptions,
} from "../useMarchers";
import { marcherAppearancesKeys } from "../useMarcherAppearances";

// Collect the queryKey of every invalidateQueries call
const invalidatedKeys = (
    spy: ReturnType<typeof vi.spyOn>,
): readonly unknown[][] =>
    spy.mock.calls.map(
        (call) => (call[0] as { queryKey: unknown[] })?.queryKey,
    );

describe("marcher mutations refresh dot appearances", () => {
    it("createMarchers invalidates the marcher-appearances query", async () => {
        const qc = new QueryClient();
        const spy = vi
            .spyOn(qc, "invalidateQueries")
            .mockResolvedValue(undefined);

        await createMarchersMutationOptions(qc).onSuccess?.(
            [] as never,
            [] as never,
            undefined as never,
            undefined as never,
        );

        expect(invalidatedKeys(spy)).toContainEqual(
            marcherAppearancesKeys.all(),
        );
    });

    it("updateMarchers invalidates the marcher-appearances query", async () => {
        const qc = new QueryClient();
        const spy = vi
            .spyOn(qc, "invalidateQueries")
            .mockResolvedValue(undefined);

        await updateMarchersMutationOptions(qc).onSuccess?.(
            [] as never,
            [] as never,
            undefined as never,
            undefined as never,
        );

        expect(invalidatedKeys(spy)).toContainEqual(
            marcherAppearancesKeys.all(),
        );
    });
});
