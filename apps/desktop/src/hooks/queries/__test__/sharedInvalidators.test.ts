import { describe, expect, it, vi } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
import { invalidateByPage } from "../sharedInvalidators";
import { marcherPageKeys } from "../useMarcherPages";
import { coordinateDataKeys } from "../useCoordinateData";

// Guards against a regression where a coordinate edit only refreshed the edited
// page. Inheritance recompute can rewrite any non-anchor page so all marcher
// pages must be invalidated
describe("invalidateByPage", () => {
    it("invalidates all marcher pages and coordinate data, not just the edited page", () => {
        const invalidateQueries = vi.fn();
        const qc = { invalidateQueries } as unknown as QueryClient;

        invalidateByPage(qc, new Set([0]));

        const calledKeys = invalidateQueries.mock.calls.map(
            ([arg]) => arg.queryKey,
        );
        expect(calledKeys).toContainEqual(marcherPageKeys.all());
        expect(calledKeys).toContainEqual(coordinateDataKeys.all);

        // A show-wide key has no page id, so the fix cannot be a per-page byPage call
        expect(calledKeys).not.toContainEqual(marcherPageKeys.byPage(0));
    });
});
