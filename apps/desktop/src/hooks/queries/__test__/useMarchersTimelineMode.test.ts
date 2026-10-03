import { vi, expect } from "vitest";
import { eq, inArray } from "drizzle-orm";
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
            // Its own one-slot move in every stored timeline of the converted show (UI-9 New
            // marchers, P8.14), not a slot in the page moves
            expect(transitions.length).toBeGreaterThan(0);
            const timelines = await db.select().from(schema.timelines).all();
            // Exactly one assignment per stored timeline
            expect(assignments).toHaveLength(timelines.length);
            const own = await db
                .select()
                .from(schema.timeline_transitions)
                .where(
                    inArray(
                        schema.timeline_transitions.id,
                        assignments.map((a) => a.transition_id),
                    ),
                )
                .all();
            expect(own.map((t) => t.timeline_id).sort()).toEqual(
                timelines.map((t) => t.id).sort(),
            );
            for (const t of own) expect(t.slot_count).toBe(1);
            expect(
                own.some((t) => transitions.some((p) => p.id === t.id)),
            ).toBe(false);
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
