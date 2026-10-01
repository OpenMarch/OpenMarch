/**
 * Page and beat row helpers with no renderer dependencies, so the main process can load them
 * (the page converter runs there when a file is converted on open, P9.3). `page.ts` and `beat.ts`
 * re-export them; import them from there in renderer code.
 */
import type { schema } from "@/global/database/db";
import type { DatabaseBeat } from "./beat";
import type { DatabasePage } from "./page";

/** The id of the first page, which holds only beat 0. */
export const FIRST_PAGE_ID = 0;

export const realDatabaseBeatToDatabaseBeat = (
    beat: typeof schema.beats.$inferSelect,
): DatabaseBeat => {
    return {
        ...beat,
        include_in_measure: beat.include_in_measure === 1,
    };
};

export const realDatabasePageToDatabasePage = (
    page: typeof schema.pages.$inferSelect,
): DatabasePage => {
    return {
        ...page,
        is_subset: page.is_subset === 1,
    };
};
