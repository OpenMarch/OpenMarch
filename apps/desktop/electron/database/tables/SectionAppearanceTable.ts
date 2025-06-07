import { DB } from "../db";
import * as schema from "../schema/schema";
import { eq, inArray } from "drizzle-orm";
import * as History from "../database.history";

export type SectionAppearance = typeof schema.sectionAppearances.$inferSelect;

export interface NewSectionAppearanceArgs {
    section: string;
    fill_color?: string;
    outline_color?: string;
    shape_type?: string;
}

export function createSectionAppearances({
    orm,
    newSectionAppearances,
}: {
    orm: DB;
    newSectionAppearances: NewSectionAppearanceArgs[];
}): SectionAppearance[] {
    return orm.transaction((tx) => {
        History.incrementUndoGroupDrizzle(tx);

        return tx
            .insert(schema.sectionAppearances)
            .values(newSectionAppearances)
            .returning()
            .all();
    });
}

export interface ModifiedSectionAppearanceArgs {
    id: number;
    fill_color?: string;
    outline_color?: string;
    shape_type?: string;
}

export function updateSectionAppearances({
    orm,
    modifiedSectionAppearances,
}: {
    orm: DB;
    modifiedSectionAppearances: ModifiedSectionAppearanceArgs[];
}): SectionAppearance[] {
    return orm.transaction((tx) => {
        History.incrementUndoGroupDrizzle(tx);

        return modifiedSectionAppearances.map((modifiedSectionAppearance) => {
            return tx
                .update(schema.sectionAppearances)
                .set(modifiedSectionAppearance)
                .where(
                    eq(
                        schema.sectionAppearances.id,
                        modifiedSectionAppearance.id,
                    ),
                )
                .returning()
                .get();
        });
    });
}

/**
 * @returns Deleted section appearances
 */
export function deleteSectionAppearances({
    orm,
    sectionAppearanceIds,
}: {
    orm: DB;
    sectionAppearanceIds: Set<number>;
}): SectionAppearance[] {
    return orm.transaction((tx) => {
        History.incrementUndoGroupDrizzle(tx);

        return tx
            .delete(schema.sectionAppearances)
            .where(
                inArray(
                    schema.sectionAppearances.id,
                    Array.from(sectionAppearanceIds),
                ),
            )
            .returning()
            .all();
    });
}
