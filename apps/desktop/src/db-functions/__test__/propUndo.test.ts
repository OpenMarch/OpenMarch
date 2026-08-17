import { expect } from "vitest";
import {
    createProps,
    getPropPageGeometry,
    updateProps,
    updatePropGeometryWithPropagation,
} from "../prop";
import { performUndo } from "../history";
import { describeDbTests } from "@/test/base";
import { schema } from "@/global/database/db";
import type { DbConnection } from "../types";

/**
 * Number of distinct undo groups on the stack. One user action should add
 * exactly one group, however many rows it writes — the stack's *row* count
 * grows with the rows, so counting rows would not catch bad grouping.
 */
const undoGroupCount = async (db: DbConnection): Promise<number> => {
    const rows = await db
        .select({ group: schema.history_undo.history_group })
        .from(schema.history_undo);
    return new Set(rows.map((r) => r.group)).size;
};

describeDbTests("prop geometry undo", (it) => {
    it("undoes a propagated geometry change in a single step", async ({
        db,
        pages,
    }) => {
        expect(pages.expectedPages.length).toBeGreaterThan(1);

        const [prop] = await createProps({
            db,
            newProps: [{ name: "Undo Test", width: 10, height: 10 }],
        });
        expect(prop).toBeDefined();

        const before = await getPropPageGeometry({ db });
        expect(before.length).toBeGreaterThan(1);
        expect(before.every((g) => g.width === 10)).toBe(true);

        const groupsBefore = await undoGroupCount(db);

        // One user action: resize this prop on every page.
        await updatePropGeometryWithPropagation({
            propId: prop.id,
            currentPageId: pages.expectedPages[0].id,
            changes: { width: 25 },
            propagation: "all",
            db,
        });

        const afterEdit = await getPropPageGeometry({ db });
        expect(afterEdit.every((g) => g.width === 25)).toBe(true);

        // One user action should be one undo group, however many rows it wrote.
        expect(await undoGroupCount(db)).toBe(groupsBefore + 1);

        // A single undo must restore every page, not just the last row written.
        await performUndo(db);

        const afterUndo = await getPropPageGeometry({ db });
        expect(afterUndo.every((g) => g.width === 10)).toBe(true);
    });

    it("keeps consecutive geometry edits in separate undo groups", async ({
        db,
        pages,
    }) => {
        const [prop] = await createProps({
            db,
            newProps: [{ name: "Consecutive Test", width: 10, height: 10 }],
        });
        const currentPageId = pages.expectedPages[0].id;

        // Two separate user actions, back to back, with no other tracked write
        // in between — resize, then resize again.
        await updatePropGeometryWithPropagation({
            propId: prop.id,
            currentPageId,
            changes: { width: 25 },
            propagation: "current",
            db,
        });
        await updatePropGeometryWithPropagation({
            propId: prop.id,
            currentPageId,
            changes: { width: 40 },
            propagation: "current",
            db,
        });

        // One undo should step back to 25, not all the way to 10.
        await performUndo(db);

        const geometries = await getPropPageGeometry({ db });
        const edited = geometries.find((g) => g.width !== 10);
        expect(edited?.width).toBe(25);
    });

    it("does not swallow the next action into the same undo group", async ({
        db,
        pages,
    }) => {
        const [prop] = await createProps({
            db,
            newProps: [{ name: "Boundary Test", width: 10, height: 10 }],
        });

        // Action 1: resize the prop.
        await updatePropGeometryWithPropagation({
            propId: prop.id,
            currentPageId: pages.expectedPages[0].id,
            changes: { width: 25 },
            propagation: "current",
            db,
        });

        // Action 2: an unrelated later edit.
        await updateProps({
            db,
            modifiedProps: [{ id: prop.id, name: "Renamed" }],
        });

        // Undoing action 2 must leave action 1 alone. Without a group boundary
        // after the geometry write, both land in one group and a single undo
        // reverts the resize as well.
        await performUndo(db);

        const geometries = await getPropPageGeometry({ db });
        const resized = geometries.filter((g) => g.width === 25);
        expect(resized.length).toBe(1);
    });

    it("undoes a single-page geometry change in a single step", async ({
        db,
        pages,
    }) => {
        const [prop] = await createProps({
            db,
            newProps: [{ name: "Undo Test Single", width: 10, height: 10 }],
        });

        const currentPageId = pages.expectedPages[0].id;
        const groupsBefore = await undoGroupCount(db);

        await updatePropGeometryWithPropagation({
            propId: prop.id,
            currentPageId,
            changes: { width: 30, height: 40 },
            propagation: "current",
            db,
        });

        expect(await undoGroupCount(db)).toBe(groupsBefore + 1);

        await performUndo(db);

        const afterUndo = await getPropPageGeometry({ db });
        expect(afterUndo.every((g) => g.width === 10 && g.height === 10)).toBe(
            true,
        );
    });
});
