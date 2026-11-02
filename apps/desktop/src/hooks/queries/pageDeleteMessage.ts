import tolgee from "@/global/singletons/Tolgee";
import {
    pageRuns,
    type PageAfterDelete,
    type PageDeleteWithMovesResult,
} from "@/db-functions/pageDelete";
import { formatList } from "@/utilities/formatList";

/** "Pages 3–5 changed", "old Page 3 changed", or both kinds in one sentence. */
const changedPagesMessage = (changedPages: readonly PageAfterDelete[]) => {
    const kept = changedPages.filter((p) => !p.renamed);
    const renamed = changedPages.filter((p) => p.renamed);
    if (kept.length > 0 && renamed.length > 0)
        return tolgee.t("pages.deleteWithMoves.changedBoth", {
            keptCount: kept.length,
            kept: formatList(pageRuns(kept)),
            renamedCount: renamed.length,
            renamed: formatList(pageRuns(renamed)),
        });
    if (kept.length > 0)
        return tolgee.t("pages.deleteWithMoves.changed", {
            count: kept.length,
            pages: formatList(pageRuns(kept)),
        });
    if (renamed.length > 0)
        return tolgee.t("pages.deleteWithMoves.changedOld", {
            count: renamed.length,
            pages: formatList(pageRuns(renamed)),
        });
    return tolgee.t("pages.deleteWithMoves.noOtherChanged");
};

/**
 * The toast after a delete with its moves, in set and count terms with the numbers the user knew
 * (defined-coordinates 08): "Deleted Page 2 · Page 1 is now 16 counts · old Pages 3–4 changed",
 * leaving out what doesn't apply, and "· No other page changed" when every page left looks the
 * same.
 */
export function pageDeleteWithMovesMessage({
    deletedNames,
    grownPages,
    changedPages,
}: Pick<
    PageDeleteWithMovesResult,
    "deletedNames" | "grownPages" | "changedPages"
>): string {
    return [
        tolgee.t("pages.deleteWithMoves.deleted", {
            count: deletedNames.length,
            names: formatList(deletedNames),
        }),
        ...grownPages.map((p) =>
            tolgee.t(
                p.renamed
                    ? "pages.deleteWithMoves.grownOld"
                    : "pages.deleteWithMoves.grown",
                { page: p.name, counts: p.counts },
            ),
        ),
        changedPagesMessage(changedPages),
    ].join(" · ");
}
