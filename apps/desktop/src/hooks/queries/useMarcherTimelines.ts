import { queryOptions } from "@tanstack/react-query";
import { DEFAULT_STALE_TIME } from "./constants";
import { db } from "@/global/database/db";
import { dbToMarcherTimeline } from "@/services/rendering/db-to-timeline";

const KEY_BASE = "marcher_timelines";

export const marcherTimelineKeys = {
    all: () => [KEY_BASE] as const,
    byMarcherId: (marcherId: number) => [KEY_BASE, marcherId] as const,
};

export const marcherTimelineQueryOptions = (
    marcherId: number,
    pagesSorted: { page_id: number; timestamp: number }[],
) => {
    return queryOptions({
        queryKey: marcherTimelineKeys.byMarcherId(marcherId),
        queryFn: async () => {
            return await db.query.marcher_pages.findMany({
                where: (table, { eq }) => eq(table.marcher_id, marcherId),
                columns: {
                    x: true,
                    y: true,
                    page_id: true,
                },
            });
        },
        select: (coordinates) => {
            return dbToMarcherTimeline(coordinates, pagesSorted);
        },
        staleTime: DEFAULT_STALE_TIME,
    });
};
