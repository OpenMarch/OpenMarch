import { expect } from "vitest";
import { eq } from "drizzle-orm";
import { describeDbTests, schema } from "@/test/base";
import { performUndo, transactionWithHistory } from "../history";

describeDbTests("undo while an edit is in progress", (it) => {
    it("waits for the edit to commit, then undoes it", async ({
        db,
        marchersAndPages,
    }) => {
        const pageId = marchersAndPages.expectedPages[1].id;
        const setNotes = (notes: string) =>
            transactionWithHistory(db, "setNotes", async (tx) => {
                await tx
                    .update(schema.pages)
                    .set({ notes })
                    .where(eq(schema.pages.id, pageId));
            });
        await setNotes("before");

        const events: string[] = [];
        let releaseEdit!: () => void;
        const editHeld = new Promise<void>((resolve) => {
            releaseEdit = resolve;
        });
        const edit = transactionWithHistory(db, "heldEdit", async (tx) => {
            await tx
                .update(schema.pages)
                .set({ notes: "during" })
                .where(eq(schema.pages.id, pageId));
            await editHeld;
            events.push("edit committed");
        });
        // Let the held edit open its transaction before undo is requested
        await new Promise((resolve) => setTimeout(resolve, 50));

        const undo = performUndo(db).then((response) => {
            events.push("undo finished");
            return response;
        });
        await new Promise((resolve) => setTimeout(resolve, 50));
        releaseEdit();
        await edit;
        const undoResponse = await undo;

        expect(undoResponse.success).toBe(true);
        expect(events).toEqual(["edit committed", "undo finished"]);
        const page = await db.query.pages.findFirst({
            where: eq(schema.pages.id, pageId),
        });
        expect(page?.notes).toBe("before");
    });
});
