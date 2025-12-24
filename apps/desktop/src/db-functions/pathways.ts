import { Path, Point } from "@openmarch/core";
import { DbTransaction } from "./types";
import { schema } from "@/global/database/db";
import { assert } from "@/utilities/utils";
import { eq } from "drizzle-orm";
const { pathways, marcher_pages } = schema;

/**
 * Updates the start or end point of a pathway.
 * @param tx - The database transaction.
 * @param pathwayId - The ID of the pathway to update.
 * @param pathwayObj - The pathway object to update.
 * @param newPoint - The new point to update the pathway to.
 * @param type - The type of point to update, either "start" or "end".
 */
export async function updateEndPoint({
    tx,
    pathwayId,
    newPoint,
    type,
}: {
    tx: DbTransaction;
    pathwayId: number;
    newPoint: Point;
    type: "start" | "end";
}) {
    const pathwayResponse = await tx.query.pathways.findFirst({
        where: eq(pathways.id, pathwayId),
    });

    if (!pathwayResponse) {
        throw new Error("Pathway not found");
    }

    const pathwayObj = Path.fromJson(pathwayResponse.path_data);

    type === "start"
        ? pathwayObj.setStartPoint(newPoint)
        : pathwayObj.setEndPoint(newPoint);

    // assert that the point was updated
    if (type === "start") {
        assert(
            pathwayObj.getStartPoint().x === newPoint.x &&
                pathwayObj.getStartPoint().y === newPoint.y,
            "Start point was not updated",
        );
    } else {
        assert(
            pathwayObj.getLastPoint().x === newPoint.x &&
                pathwayObj.getLastPoint().y === newPoint.y,
            "End point was not updated",
        );
    }

    const response = await tx
        .update(pathways)
        .set({
            path_data: pathwayObj.toJson(),
        })
        .where(eq(pathways.id, pathwayId))
        .returning({
            id: pathways.id,
            path_data: pathways.path_data,
        });

    return response;
}

/**
 * Finds the page IDs that are associated with a given pathway
 * @param tx - The database transaction.
 * @param pathwayId - The ID of the pathway to find the page IDs for.
 * @returns
 */
export const findPageIdsForPathway = async ({
    tx,
    pathwayId,
}: {
    tx: DbTransaction;
    pathwayId: number;
}) => {
    const results = await tx
        .selectDistinct({
            page_id: marcher_pages.page_id,
        })
        .from(marcher_pages)
        .where(eq(marcher_pages.path_data_id, pathwayId))
        .all();
    return results.map((result) => result.page_id);
};
