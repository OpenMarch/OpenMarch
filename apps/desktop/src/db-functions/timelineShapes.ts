import { asc, eq } from "drizzle-orm";
import * as schema from "@om-electron/database/migrations/schema";
import type { DbConnection } from "./types";
import { transactionWithHistory } from "./history";
import { refuse } from "./timelineErrors";
import {
    createTimelineShapesInTransaction,
    deleteTimelineShapesInTransaction,
    updateTimelineShapesInTransaction,
    type DatabaseTimelineShape,
    type ModifiedTimelineShapeArgs,
    type NewTimelineShapeArgs,
} from "./timelineShapesInTransaction";

export * from "./timelineShapesInTransaction";

/** `createTimelineShapesInTransaction` for one shape, as one undoable edit (P8.2). */
export const createTimelineShape = async ({
    db,
    newShape,
}: {
    db: DbConnection;
    newShape: NewTimelineShapeArgs;
}): Promise<DatabaseTimelineShape> => {
    const [row] = await transactionWithHistory(
        db,
        "createTimelineShape",
        (tx) =>
            createTimelineShapesInTransaction({ tx, newShapes: [newShape] }),
    );
    return row!;
};

/**
 * `updateTimelineShapesInTransaction` for one shape, as one undoable edit (P8.2). An update that
 * changes nothing still opens an edit, which `transactionWithHistory` refuses, so skip no-op
 * changes before calling it. A change that would break a transition using the shape is refused
 * by the database (E-T3/E-T4), and nothing is written.
 */
export const updateTimelineShape = async ({
    db,
    modified,
}: {
    db: DbConnection;
    modified: ModifiedTimelineShapeArgs;
}): Promise<DatabaseTimelineShape> => {
    const [row] = await transactionWithHistory(
        db,
        "updateTimelineShape",
        (tx) =>
            updateTimelineShapesInTransaction({
                tx,
                modifiedShapes: [modified],
            }),
    );
    return row!;
};

/**
 * Deletes one shape as one undoable edit (P8.2). A shape that a transition uses is refused before
 * anything is written (I-D1), with a message that names those transitions (`E-ARGS`). The
 * foreign key (RESTRICT) stays the backstop.
 */
export const deleteTimelineShape = async ({
    db,
    shapeId,
}: {
    db: DbConnection;
    shapeId: number;
}): Promise<void> => {
    await transactionWithHistory(db, "deleteTimelineShape", async (tx) => {
        const users = await tx
            .select({ id: schema.timeline_transitions.id })
            .from(schema.timeline_transitions)
            .where(eq(schema.timeline_transitions.dest_shape_id, shapeId))
            .orderBy(asc(schema.timeline_transitions.id))
            .all();
        if (users.length > 0)
            refuse(
                `Shape ${shapeId} can't be deleted while ${
                    users.length === 1 ? "transition" : "transitions"
                } ${users.map((u) => u.id).join(", ")} ${
                    users.length === 1 ? "uses" : "use"
                } it. Give ${
                    users.length === 1 ? "it" : "them"
                } another destination first.`,
            );
        const deleted = await deleteTimelineShapesInTransaction({
            tx,
            shapeIds: new Set([shapeId]),
        });
        if (deleted.length === 0) refuse(`shape ${shapeId} does not exist`);
    });
};
