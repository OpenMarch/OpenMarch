import type { DbConnection } from "@/db-functions/types";
import { transactionWithHistory } from "@/db-functions/history";
import {
    convertPagesToTimelineInTransaction,
    type ConvertPagesOptions,
    type PageConversionResult,
} from "./convertPagesInTransaction";

export * from "./convertPagesInTransaction";

/** Converts the open file's page show as one undoable edit. */
export function convertPagesToTimeline(
    db: DbConnection,
    options: ConvertPagesOptions = {},
): Promise<PageConversionResult> {
    return transactionWithHistory(db, "convertPagesToTimeline", (tx) =>
        convertPagesToTimelineInTransaction(tx, options),
    );
}
