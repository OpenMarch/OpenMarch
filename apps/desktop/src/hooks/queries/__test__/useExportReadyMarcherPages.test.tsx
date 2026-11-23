import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { eq, sql } from "drizzle-orm";
import { expect } from "vitest";
import { describeDbTests, schema } from "@/test/base";
import { invalidateByPage } from "../sharedInvalidators";
import { useExportReadyMarcherPages } from "../useMarcherPages";

describeDbTests("useExportReadyMarcherPages", (it) => {
    it("loads positions saved after an export panel opened", async ({
        db,
        marchersAndPages,
    }) => {
        const qc = new QueryClient();
        const { result } = renderHook(() => useExportReadyMarcherPages(), {
            wrapper: ({ children }) => (
                <QueryClientProvider client={qc}>
                    {children}
                </QueryClientProvider>
            ),
        });
        await waitFor(() => expect(result.current.isReady).toBe(true));

        // An edit commits while the export panel is open
        const { marcher_id, page_id } =
            marchersAndPages.expectedMarcherPages[0];
        await db
            .update(schema.marcher_pages)
            .set({ x: 123.5 })
            .where(eq(schema.marcher_pages.marcher_id, marcher_id));
        act(() => invalidateByPage(qc, new Set([page_id])));

        await waitFor(() => {
            expect(result.current.isReady).toBe(true);
            expect(
                result.current.data?.marcherPagesByMarcher[marcher_id][page_id]
                    .x,
            ).toBe(123.5);
        });
    });

    it("does not keep fetching after the query fails", async ({ db }) => {
        // Make every whole-show fetch fail
        await db.run(
            sql`ALTER TABLE marcher_pages RENAME TO marcher_pages_gone`,
        );
        const qc = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
        let fetches = 0;
        qc.getQueryCache().subscribe((event) => {
            if (event.type === "updated" && event.action.type === "fetch")
                fetches++;
        });
        const { result } = renderHook(() => useExportReadyMarcherPages(), {
            wrapper: ({ children }) => (
                <QueryClientProvider client={qc}>
                    {children}
                </QueryClientProvider>
            ),
        });

        await waitFor(() => expect(result.current.isError).toBe(true));
        await new Promise((resolve) => setTimeout(resolve, 300));

        expect(fetches).toBe(1);
        expect(result.current.isReady).toBe(false);
    });
});
