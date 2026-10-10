import { vi, expect } from "vitest";
import { eq } from "drizzle-orm";
import { QueryClient } from "@tanstack/react-query";
import { describeDbTests, schema } from "@/test/base";
import { timelineFixtureMode } from "@/test/timelineMode";

/**
 * The marcher create and delete mutations take the file's mode: `createMarchers` and
 * `deleteMarchers` read the flag inside their own edit (P7.3, P7.18), so a mutation started before
 * the workspace settings query has loaded (an empty query client here) still takes the right path.
 *
 * Runs on the `base.tsx` fixtures, so the default run checks page mode and `test:timeline` (a
 * converted show with the flag on) checks timeline mode.
 */

vi.mock("@/App", () => ({ queryClient: undefined }));

const { createMarchersMutationOptions, deleteMarchersMutationOptions } =
    await import("../useMarchers");

const NEW = [{ section: "Trumpet", drill_prefix: "T", drill_order: 99 }];

describeDbTests("marcher mutations take the file's mode", (it) => {
    it("a create with no settings loaded follows the file's flag", async ({
        db,
        marchersAndPages: _,
    }) => {
        const qc = new QueryClient();
        const transitions = await db
            .select()
            .from(schema.timeline_transitions)
            .all();
        const [created] = await createMarchersMutationOptions(qc).mutationFn!(
            NEW,
            undefined as never,
        );
        const assignments = await db
            .select()
            .from(schema.timeline_assignments)
            .where(eq(schema.timeline_assignments.marcher_id, created!.id))
            .all();
        if (timelineFixtureMode()) {
            // A home and no moves (UI-18, ADR 0001 C-12: no row is written on a page's behalf):
            // the converted show's transitions are untouched, and the marcher stands at home
            expect(transitions.length).toBeGreaterThan(0);
            expect(assignments).toEqual([]);
            expect(
                await db.select().from(schema.timeline_transitions).all(),
            ).toEqual(transitions);
            // Its home is its own, not on top of anyone else's
            const marchers = await db.select().from(schema.marchers).all();
            const own = marchers.find((m) => m.id === created!.id)!;
            for (const m of marchers)
                if (m.id !== own.id)
                    expect([m.home_x, m.home_y]).not.toEqual([
                        own.home_x,
                        own.home_y,
                    ]);
        } else {
            expect(transitions).toEqual([]);
            expect(assignments).toEqual([]);
        }
        // Page rows are written in page mode only: they're frozen in timeline mode (P9.5)
        const pageRows = await db
            .select()
            .from(schema.marcher_pages)
            .where(eq(schema.marcher_pages.marcher_id, created!.id))
            .all();
        if (timelineFixtureMode()) expect(pageRows).toEqual([]);
        else expect(pageRows.length).toBeGreaterThan(0);
    });

    it("a delete with no settings loaded follows the file's flag", async ({
        db,
        marchersAndPages,
    }) => {
        const qc = new QueryClient();
        const victim = marchersAndPages.expectedMarchers[1]!.id;
        const slotCounts = async () =>
            (await db.select().from(schema.timeline_transitions).all()).map(
                (t) => t.slot_count,
            );
        const before = await slotCounts();
        await deleteMarchersMutationOptions(qc).mutationFn!(
            new Set([victim]),
            undefined as never,
        );
        const marcher = await db
            .select()
            .from(schema.marchers)
            .where(eq(schema.marchers.id, victim))
            .get();
        expect(marcher).toBeUndefined();
        if (timelineFixtureMode()) {
            // Each page move lost the victim's slot (compacted, P7.3)
            expect(before.length).toBeGreaterThan(0);
            expect(await slotCounts()).toEqual(before.map((n) => n - 1));
        } else {
            expect(before).toEqual([]);
            expect(await slotCounts()).toEqual([]);
        }
    });
});
