/**
 * The text every page-era freeze trigger's `RAISE` message ends with (P9.5). The triggers are
 * built in `electron/database/migrations/triggers.ts` (`PAGE_ERA_FROZEN_RAISE_SUFFIX`), which
 * keeps its own copy so it stays free of renderer imports; a test checks that the two match.
 */
export const PAGE_ERA_FROZEN_DB_MARKER =
    "is read-only in timeline mode (page-era data, P9.5)";

/** Whether `error`, or any of its causes, is a page-era freeze trigger's refusal. */
export function isPageEraFrozenError(error: unknown): boolean {
    for (let e: unknown = error; e instanceof Error; e = e.cause)
        if (e.message.includes(PAGE_ERA_FROZEN_DB_MARKER)) return true;
    return (
        typeof error === "string" && error.includes(PAGE_ERA_FROZEN_DB_MARKER)
    );
}
