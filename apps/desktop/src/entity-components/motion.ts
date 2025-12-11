/**
 * Motion defines an object that can move along the canvas
 */

import { sqliteTable } from "drizzle-orm/sqlite-core";
import { motion_columns } from "../../electron/database/migrations/schema";
import { InferSelectModel } from "drizzle-orm";
import { Path } from "@openmarch/path-utility";
import { db } from "@/global/database/db";

/** a table that is used to infer the type of the appearance columns. Do not export this table. */
const fakeMotionTable = sqliteTable("fake_motion_table", {
    ...motion_columns,
});

/** Definition of a marcher motion exactly as it is stored in the database. */
export type MotionComponentRaw = InferSelectModel<typeof fakeMotionTable>;

export type MotionComponentUpdateArgs = Partial<MotionComponentRaw>;

/** Parsed definition of motion component. Path data is parsed and created */
export type MotionComponent = MotionComponentRaw;

const getPathDataById = async (pathwayId: number): Promise<Path | null> => {
    const pathwayResponse = await db.query.pathways.findFirst({
        where: (pathways, { eq }) => eq(pathways.id, pathwayId),
    });
    return pathwayResponse ? Path.fromJson(pathwayResponse.path_data) : null;
};

/**
 * Converts a raw motion component to a parsed motion component.
 *
 * @param motion
 * @param pathDataFunction - an optional function to get the path data by pathway id. Replace for testing.
 */
export const motionModelRawToParsed = (
    motion: MotionComponentRaw,
): MotionComponent => {
    return motion;
};

/**
 * Converts a parsed motion component to a raw motion component.
 *
 * @param motion
 * @returns The raw motion component.
 */
export const motionModelParsedToRaw = (
    motion: MotionComponent,
): MotionComponentRaw => {
    // const { path_data, ...rest } = motion;
    return {
        ...motion,
    };
};
