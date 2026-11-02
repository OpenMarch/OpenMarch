import tolgee from "@/global/singletons/Tolgee";
import type { ToolGroup } from "../tool/toolKind";

/**
 * How the floating editor names a shape's interval groups when it has two or more (owner feedback
 * on #526): `words` says "Multiple intervals", `numbers` sums them up compactly ("2·3 + 4·2").
 * Both open the same group menu. Words by default; the other is kept so the two can be compared.
 */
export type GroupSummaryStyle = "words" | "numbers";
export const GROUP_SUMMARY_STYLE: GroupSummaryStyle = "words";

/** Where the summary style can be switched for a comparison, without a new build */
const STYLE_KEY = "openmarch:groupSummary";

/** The summary style in use: {@link GROUP_SUMMARY_STYLE}, unless switched for a comparison */
export function groupSummaryStyle(): GroupSummaryStyle {
    try {
        const stored = globalThis.localStorage?.getItem(STYLE_KEY);
        if (stored === "words" || stored === "numbers") return stored;
    } catch {
        // No storage (a locked-down browser): the default
    }
    return GROUP_SUMMARY_STYLE;
}

/** How many groups the compact summary names before it ends with "…" */
export const SUMMARY_GROUPS = 3;

/**
 * The groups in a few characters: `2·3 + 4·2`, each count · interval in steps, "the rest" as
 * `rest·4`. Groups dropped off the end aren't named; past `max` groups it ends with "…".
 */
export function groupSummary(
    groups: readonly ToolGroup[],
    max = SUMMARY_GROUPS,
): string {
    const parts = groups
        .filter((g) => !g.dropped)
        .map(
            (g) =>
                `${g.rest ? tolgee.t("shapes.groups.restShort", "rest") : g.count}·${g.interval}`,
        );
    const shown = parts.slice(0, max);
    if (parts.length > max) shown.push("…");
    return shown.join(" + ");
}

/**
 * Each group's marchers in words, by where they stand along the shape (review of #577): "First 2",
 * "Next 3", "Last 3". Not drill numbers: on a placed shape, or after Least travel, the first spot
 * needn't be B1. The group at the end, counted or the rest, is the last; one alone is "All 8"; a
 * group dropped off the end has "No marchers left".
 */
export function groupPlaces(groups: readonly ToolGroup[]): string[] {
    const counts = groups.map((g) => Number(g.count));
    const first = counts.findIndex((c) => c > 0);
    const last = counts.findLastIndex((c) => c > 0);
    return counts.map((count, i) => {
        if (!(count > 0))
            return tolgee.t("shapes.groups.noMarchers", "No marchers left");
        if (i === first && i === last)
            return tolgee.t("shapes.groups.all", "All {count}", { count });
        if (i === first)
            return tolgee.t("shapes.groups.first", "First {count}", { count });
        if (i === last)
            return tolgee.t("shapes.groups.last", "Last {count}", { count });
        return tolgee.t("shapes.groups.next", "Next {count}", { count });
    });
}
