import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, vi } from "vitest";
import { describeDbTests } from "@/test/base";
import tolgee from "@/global/singletons/Tolgee";
import { useCreateMarcherShape } from "../MarcherShape";

describeDbTests("useCreateMarcherShape", (it) => {
    it("tells the user when the shape could not be created", async ({
        wrapper,
        db,
        marchersAndPages,
    }) => {
        const consoleError = vi.spyOn(console, "error");
        const { result } = renderHook(() => useCreateMarcherShape(), {
            wrapper,
        });
        const args = {
            pageId: marchersAndPages.expectedPages[1].id,
            marcherIds: [1, 2],
            start: { x: 0, y: 0 },
            end: { x: 100, y: 0 },
        };
        await act(() => result.current.mutateAsync(args));

        // Marcher 2 is already in the shape on this page
        let error: unknown;
        await act(async () => {
            await result.current
                .mutateAsync({ ...args, marcherIds: [2, 3] })
                .catch((e: unknown) => {
                    error = e;
                });
        });
        expect(error).toBeDefined();

        await waitFor(() =>
            expect(consoleError).toHaveBeenCalledWith(
                tolgee.t("inspector.shape.errorCreating"),
                expect.anything(),
                expect.anything(),
            ),
        );
    });
});
