import { vi, expect } from "vitest";
import { eq } from "drizzle-orm";
import { QueryClient } from "@tanstack/react-query";
import { describeDbTests, schema } from "@/test/base";

/**
 * The marcher create and delete mutations on a converted show (P7.3, P7.18): a new marcher gets a
 * home and no moves, and a deleted marcher's slots are compacted.
 */

vi.mock("@/App", () => ({ queryClient: undefined }));

const { createMarchersMutationOptions, deleteMarchersMutationOptions } =
    await import("../useMarchers");

const NEW = [{ section: "Trumpet", drill_prefix: "T", drill_order: 99 }];

describeDbTests("marcher mutations", (it) => {
    it("a create gives the marcher a home and no moves", async ({
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
        // A home and no moves (UI-18, ADR 0001 C-12: no row is written on a page's behalf): the
        // converted show's transitions are untouched, and the marcher stands at home
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
    });

    it("a delete compacts the marcher's slots", async ({
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
        // Each page move lost the victim's slot (compacted, P7.3)
        expect(before.length).toBeGreaterThan(0);
        expect(await slotCounts()).toEqual(before.map((n) => n - 1));
    });
});
