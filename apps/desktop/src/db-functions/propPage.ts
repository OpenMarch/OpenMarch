import { eq, and } from "drizzle-orm";
import { DbConnection, DbTransaction } from "./types";
import { schema } from "@/global/database/db";
import { transactionWithHistory } from "./history";
import * as z from "zod";
// Define types from the existing schema
export type DatabasePropPage = typeof schema.prop_pages.$inferSelect;

export const Point = z.tuple([z.number(), z.number()]);
const RelativePoints = z.array(Point);
export const PropPageOriginXOptions = ["left", "center", "right"] as const;
export const PropPageOriginYOptions = ["top", "center", "bottom"] as const;
export const PropPageOriginX = z.enum(PropPageOriginXOptions).default("center");
export const PropPageOriginY = z.enum(PropPageOriginYOptions).default("center");

export type PropPage = Omit<
    DatabasePropPage,
    "relative_points" | "origin_x" | "origin_y" | "properties"
> & {
    relative_points: [number, number][];
    origin_x: (typeof PropPageOriginXOptions)[number];
    origin_y: (typeof PropPageOriginYOptions)[number];
    properties: Record<string, any>;
};

const toPropPage = (dbPropPage: DatabasePropPage): PropPage => {
    const relativePointsRaw = JSON.parse(dbPropPage.relative_points);
    const relative_points = RelativePoints.parse(relativePointsRaw);

    const originXResult = PropPageOriginX.safeParse(dbPropPage.origin_x);
    const origin_x = originXResult.success
        ? originXResult.data
        : (() => {
              console.warn(
                  `Invalid origin_x value "${dbPropPage.origin_x}" for propPage ${dbPropPage.id}. Using default "center".`,
              );
              return "center" as const;
          })();

    const originYResult = PropPageOriginY.safeParse(dbPropPage.origin_y);
    const origin_y = originYResult.success
        ? originYResult.data
        : (() => {
              console.warn(
                  `Invalid origin_y value "${dbPropPage.origin_y}" for propPage ${dbPropPage.id}. Using default "center".`,
              );
              return "center" as const;
          })();

    const properties = JSON.parse(dbPropPage.properties);

    return {
        ...dbPropPage,
        relative_points,
        origin_x: origin_x,
        origin_y: origin_y,
        properties,
    };
};

const toDatabasePropPage = (propPage: PropPage): DatabasePropPage => {
    return {
        ...propPage,
        relative_points: JSON.stringify(propPage.relative_points),
        origin_x: propPage.origin_x,
        origin_y: propPage.origin_y,
        properties: JSON.stringify(propPage.properties),
    };
};
/**
 * Filters for the propPageQueries.getAll function
 */
export type PropPageQueryFilters =
    | {
          prop_id?: number;
          page_id?: number;
      }
    | undefined;

/**
 * Defines the editable fields of a PropPage.
 * `prop_id` and `page_id` are used to identify the propPage and cannot be changed.
 */
export interface ModifiedPropPageArgs {
    prop_id: number;
    page_id: number;
    /** The new X coordinate of the PropPage */
    x: number;
    /** The new Y coordinate of the PropPage */
    y: number;
    // SHOULD THIS BE ZOD?
    /** Array of relative points  */
    relative_points: [number, number][];
    /** Origin X alignment (left, center, right) */
    origin_x?: (typeof PropPageOriginXOptions)[number];
    /** Origin Y alignment (top, center, bottom) */
    origin_y?: (typeof PropPageOriginYOptions)[number];
    notes?: string | null;
}

interface RealModifiedPropPageArgs
    extends Omit<ModifiedPropPageArgs, "relative_points"> {
    relative_points: string;
}

const modifiedPropPageArgsToRealModifiedPropPageArgs = (
    args: ModifiedPropPageArgs,
): RealModifiedPropPageArgs => {
    return {
        ...args,
        relative_points: JSON.stringify(args.relative_points),
    };
};

/**
 * Gets all prop pages from the database.
 *
 * @param db The database instance
 * @param pinkyPromiseThatYouKnowWhatYouAreDoing - if true, will not log a warning if no filters are provided
 * @returns
 */
export const getAllPropPages = async ({
    db,
    pinkyPromiseThatYouKnowWhatYouAreDoing = false,
}: {
    db: DbConnection | DbTransaction;
    pinkyPromiseThatYouKnowWhatYouAreDoing?: boolean;
}): Promise<PropPage[]> => {
    // No conditions, return all rows
    if (!pinkyPromiseThatYouKnowWhatYouAreDoing)
        console.warn(
            "Returning all propPage rows. This should not happen as this fetches all of the coordinates for the entire show. You should probably use getByPage or getByProp",
        );
    const propPagesResponse = await db.select().from(schema.prop_pages).all();
    return propPagesResponse.map(toPropPage);
};

/**
 * Gets all prop pages for a given page id.
 *
 * @param db The database instance
 * @param pageId The page id
 * @returns
 */
export const propPagesByPageId = async ({
    db,
    pageId,
}: {
    db: DbConnection | DbTransaction;
    pageId: number;
}): Promise<PropPage[]> => {
    const propPagesResponse = await db
        .select()
        .from(schema.prop_pages)
        .where(eq(schema.prop_pages.page_id, pageId));

    return propPagesResponse.map(toPropPage);
};

/**
 * Gets all prop pages by prop id.
 *
 * @param db The database instance
 * @param propId The prop id
 * @returns
 */
export const propPagesByPropId = async ({
    db,
    propId,
}: {
    db: DbConnection | DbTransaction;
    propId: number;
}): Promise<PropPage[]> => {
    const propPagesResponse = await db
        .select()
        .from(schema.prop_pages)
        .where(eq(schema.prop_pages.prop_id, propId));
    return propPagesResponse.map(toPropPage);
};

/**
 * Gets a single prop page by prop_id and page_id.
 *
 * @param db The database instance
 * @param propId The prop id
 * @param pageId The page id
 * @returns
 */
export const propPageByPropAndPage = async ({
    db,
    propId,
    pageId,
}: {
    db: DbConnection | DbTransaction;
    propId: number;
    pageId: number;
}): Promise<PropPage | undefined> => {
    const propPage = await db.query.prop_pages.findFirst({
        where: and(
            eq(schema.prop_pages.prop_id, propId),
            eq(schema.prop_pages.page_id, pageId),
        ),
    });
    return propPage ? toPropPage(propPage) : undefined;
};

export async function updatePropPagesInTransaction({
    tx,
    modifiedPropPages,
}: {
    tx: DbTransaction;
    modifiedPropPages: ModifiedPropPageArgs[];
}): Promise<PropPage[]> {
    const results: DatabasePropPage[] = [];

    for (const modifiedPropPage of modifiedPropPages) {
        const realModifiedPropPageArgs =
            modifiedPropPageArgsToRealModifiedPropPageArgs(modifiedPropPage);
        const { prop_id, page_id, ...updateData } = realModifiedPropPageArgs;
        const currentPropPage = await tx
            .update(schema.prop_pages)
            .set(updateData)
            .where(
                and(
                    eq(schema.prop_pages.prop_id, prop_id),
                    eq(schema.prop_pages.page_id, page_id),
                ),
            )
            .returning()
            .get();

        results.push(currentPropPage);
    }

    return results.map(toPropPage);
}

export async function updatePropPages({
    db,
    modifiedPropPages,
}: {
    db: DbConnection;
    modifiedPropPages: ModifiedPropPageArgs[];
}): Promise<PropPage[]> {
    const transactionResult = await transactionWithHistory(
        db,
        "updatePropPages",
        async (tx) => {
            return await updatePropPagesInTransaction({
                tx,
                modifiedPropPages,
            });
        },
    );
    return transactionResult;
}
