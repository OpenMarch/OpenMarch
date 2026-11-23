import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { invalidateByPage } from "../sharedInvalidators";
import { marcherPageKeys } from "../useMarcherPages";

describe("invalidateByPage", () => {
    it("marks the whole-show marcher pages stale so exports refetch them", () => {
        const qc = new QueryClient();
        qc.setQueryData(marcherPageKeys.all(), {});

        invalidateByPage(qc, new Set([1]));

        expect(qc.getQueryState(marcherPageKeys.all())?.isInvalidated).toBe(
            true,
        );
    });

    it("does not refetch the whole show on every edit", async () => {
        const qc = new QueryClient();
        const queryFn = vi.fn(async () => ({}));
        // An active observer, like the always-mounted SVG preview handler
        const observer = new QueryObserver(qc, {
            queryKey: marcherPageKeys.all(),
            queryFn,
            staleTime: Infinity,
        });
        const unsubscribe = observer.subscribe(() => {});
        await vi.waitFor(() => expect(queryFn).toHaveBeenCalled());
        queryFn.mockClear();

        invalidateByPage(qc, new Set([1]));
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(queryFn).not.toHaveBeenCalled();
        unsubscribe();
    });
});
