import { asc, eq, inArray } from "drizzle-orm";
import {
    normalizeStartAngle,
    validateShapeGeometry,
    type ShapeGeometry,
    type ShapeKind,
} from "@openmarch/core";
import { schema } from "@/global/database/db";
import { DbConnection, DbTransaction } from "./types";
import { transactionWithHistory } from "./history";
import {
    assertValid,
    mapDbErrors,
    refuse,
    refuseDuplicateIds,
} from "./timelineErrors";

/** A row of `timeline_shapes`; `geometry` is the JSON text (spec 5.2). */
export type DatabaseTimelineShape = typeof schema.timeline_shapes.$inferSelect;

export interface NewTimelineShapeArgs {
    name?: string | null;
    kind: ShapeKind;
    /** The geometry for `kind` (spec 5.2). A circle's `start_angle` is normalized to [0, 2*PI). */
    geometry: ShapeGeometry;
}

export interface ModifiedTimelineShapeArgs {
    id: number;
    name?: string | null;
    kind?: ShapeKind;
    /** Replaces the geometry; required when `kind` changes. */
    geometry?: ShapeGeometry;
}

/**
 * Normalizes a circle's start angle (I-S1), then validates the geometry for its kind (E-S1).
 * Returns the JSON text to store. Throws before anything is written.
 */
export const prepareShapeGeometry = (
    kind: ShapeKind,
    geometry: unknown,
): string => {
    let candidate = geometry;
    if (
        kind === "circle" &&
        typeof geometry === "object" &&
        geometry !== null &&
        !Array.isArray(geometry) &&
        typeof (geometry as { start_angle?: unknown }).start_angle === "number"
    ) {
        const g = geometry as { start_angle: number };
        candidate = { ...g, start_angle: normalizeStartAngle(g.start_angle) };
    }
    assertValid(validateShapeGeometry(kind, candidate), `${kind} geometry`);
    return JSON.stringify(candidate);
};

export const getTimelineShapeById = async ({
    tx,
    id,
}: {
    tx: DbTransaction;
    id: number;
}): Promise<DatabaseTimelineShape | undefined> =>
    await tx
        .select()
        .from(schema.timeline_shapes)
        .where(eq(schema.timeline_shapes.id, id))
        .get();

/** Creates shapes. Every geometry is validated first; nothing is written if one is invalid. */
export const createTimelineShapesInTransaction = async ({
    newShapes,
    tx,
}: {
    newShapes: NewTimelineShapeArgs[];
    tx: DbTransaction;
}): Promise<DatabaseTimelineShape[]> => {
    if (newShapes.length === 0) return [];
    const values = newShapes.map((shape) => ({
        name: shape.name ?? null,
        kind: shape.kind,
        geometry: prepareShapeGeometry(shape.kind, shape.geometry),
    }));
    return await mapDbErrors(() =>
        tx.insert(schema.timeline_shapes).values(values).returning(),
    );
};

/**
 * Updates shapes. The resulting kind and geometry are validated before the write; a block shape
 * change that would break a transition using it is rejected by the database (E-T3/E-T4).
 */
export const updateTimelineShapesInTransaction = async ({
    modifiedShapes,
    tx,
}: {
    modifiedShapes: ModifiedTimelineShapeArgs[];
    tx: DbTransaction;
}): Promise<DatabaseTimelineShape[]> => {
    const prepared: {
        id: number;
        set: Partial<typeof schema.timeline_shapes.$inferInsert>;
    }[] = [];
    refuseDuplicateIds(modifiedShapes, "shape");
    for (const modified of modifiedShapes) {
        const existing = await getTimelineShapeById({ tx, id: modified.id });
        if (!existing) refuse(`shape ${modified.id} does not exist`);
        const set: Partial<typeof schema.timeline_shapes.$inferInsert> = {};
        if (modified.name !== undefined) set.name = modified.name;
        const kind = modified.kind ?? (existing.kind as ShapeKind);
        if (modified.kind !== undefined || modified.geometry !== undefined) {
            if (modified.kind !== undefined && modified.geometry === undefined)
                refuse("changing a shape's kind needs a new geometry");
            set.kind = kind;
            set.geometry = prepareShapeGeometry(kind, modified.geometry);
        }
        prepared.push({ id: modified.id, set });
    }
    const updated: DatabaseTimelineShape[] = [];
    for (const { id, set } of prepared) {
        if (Object.keys(set).length === 0) {
            const row = await getTimelineShapeById({ tx, id });
            if (row) updated.push(row);
            continue;
        }
        const row = await mapDbErrors(() =>
            tx
                .update(schema.timeline_shapes)
                .set(set)
                .where(eq(schema.timeline_shapes.id, id))
                .returning()
                .get(),
        );
        updated.push(row);
    }
    return updated;
};

/**
 * Deletes shapes. A shape that a transition still uses can't be deleted (the foreign key is
 * RESTRICT); that surfaces as a `TimelineWriteError`.
 */
export const deleteTimelineShapesInTransaction = async ({
    shapeIds,
    tx,
}: {
    shapeIds: Set<number>;
    tx: DbTransaction;
}): Promise<DatabaseTimelineShape[]> => {
    if (shapeIds.size === 0) return [];
    return await mapDbErrors(() =>
        tx
            .delete(schema.timeline_shapes)
            .where(inArray(schema.timeline_shapes.id, [...shapeIds]))
            .returning(),
    );
};

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
