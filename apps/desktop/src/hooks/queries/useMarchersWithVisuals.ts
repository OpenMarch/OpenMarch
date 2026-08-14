import { QueryClient, queryOptions } from "@tanstack/react-query";
import MarcherVisualGroup from "@/global/classes/MarcherVisualGroup";
import Marcher from "@/global/classes/Marcher";
import { DEFAULT_STALE_TIME } from "./constants";
import { allMarchersQueryOptions } from "./useMarchers";
import { FIRST_PAGE_ID, marcherPagesByPageId } from "@/db-functions";
import { MarcherPagesByMarcher } from "@/global/classes/MarcherPageIndex";
import { marcherPagesByPageQueryOptions } from "./useMarcherPages";

const KEY_BASE = "marcher-with-visuals";

export const marcherWithVisualsKeys = {
    all: () => [KEY_BASE] as const,
};

export type MarcherVisualMap = Record<number, MarcherVisualGroup>;

/**
 * Combine queries to determine the visual style for each marcher.
 *
 * The appearance priority is as follows -
 *
 * 1. Individual marcher page appearance
 * 2. Tag appearance (sorted by priority, as marchers can have multiple tags)
 * 3. Section appearance
 * 4. (Default) Field theme appearance
 *
 * @returns
 */
export const _combineMarcherVisualGroups = ({
    marchers,
    firstPageMarcherPages,
}: {
    marchers: Marcher[];
    firstPageMarcherPages: MarcherPagesByMarcher;
}): MarcherVisualMap => {
    if (!marchers) {
        return {};
    }

    const newVisuals: Record<number, MarcherVisualGroup> = {};
    for (const marcher of marchers)
        newVisuals[marcher.id] = new MarcherVisualGroup({
            marcher,
            initialPosition: firstPageMarcherPages[marcher.id],
        });

    return newVisuals;
};

export const marcherWithVisualsQueryOptions = (queryClient: QueryClient) =>
    // eslint-disable-next-line @tanstack/query/exhaustive-deps
    queryOptions({
        queryKey: marcherWithVisualsKeys.all(),
        queryFn: async () => {
            const [marchers, firstPageMarcherPages] = await Promise.all([
                queryClient.fetchQuery(allMarchersQueryOptions()),
                queryClient.fetchQuery(
                    marcherPagesByPageQueryOptions(FIRST_PAGE_ID),
                ),
            ]);
            return _combineMarcherVisualGroups({
                marchers,
                firstPageMarcherPages,
            });
        },
        staleTime: DEFAULT_STALE_TIME,
    });
