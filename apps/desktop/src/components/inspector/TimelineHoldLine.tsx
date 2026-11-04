import { useMemo, type ReactNode } from "react";
import { useTranslate } from "@tolgee/react";
import { ArrowRightIcon } from "@phosphor-icons/react";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useTimingObjects } from "@/hooks";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import {
    marcherHoldState,
    sharedHoldState,
    type HoldState,
    type NamedFlag,
} from "@/timeline/timelineHoldState";
import { pageFlags } from "@/timeline/timelinePlayhead";
import {
    resolverSpans,
    useTimelineResolverStore,
} from "@/timeline/timelineStore";
import { OWN_KEYS_WITH_SPACE } from "@/components/timeline/timelineHotkeys";
import {
    ShortcutTooltip,
    TransportTooltipProvider,
} from "@/components/timeline/ShortcutTooltip";

/**
 * The selection's state on the current page, in timeline mode (docs/timeline/ui.md UI-18):
 * "Moves on this page" or "Last moved on Page X" ("No moves since the start" when they haven't moved since
 * their starting set), where the selected marchers agree; nothing when they
 * don't. The current page is the selected page, which follows the paused playhead
 * (`useTimelinePageBridge`).
 */
export function useSelectionHoldState(
    marcherIds: readonly number[],
): HoldState | null {
    const resolver = useTimelineResolverStore((s) => s.resolver);
    const version = useTimelineResolverStore((s) => s.version);
    const { pages } = useTimingObjects()!;
    const { selectedPage } = useSelectedPage()!;
    return useMemo(() => {
        void version; // a new version means new spans
        if (!resolver || !selectedPage || marcherIds.length === 0) return null;
        const all = pageFlags(pages);
        const current = all.find((f) => f.page.id === selectedPage.id);
        if (!current) return null;
        const flags: NamedFlag[] = all.map((f) => ({
            beat: f.flag,
            name: f.page.name,
        }));
        return sharedHoldState(
            marcherIds.map((id) =>
                marcherHoldState(
                    resolverSpans(resolver, id),
                    current.flag,
                    flags,
                ),
            ),
        );
    }, [resolver, version, pages, selectedPage, marcherIds]);
}

const LINK_CLASS =
    "text-body text-text decoration-text/40 hover:decoration-text focus-visible:ring-accent rounded-6 inline-flex items-center gap-4 leading-none underline underline-offset-4 focus-visible:ring focus-visible:outline-none";

/**
 * The marcher inspector's line for the selected marchers (UI-18), under Step Size: whether they
 * move on the current page or hold there, with a link to the page they last moved on
 * (defined-coordinates 08: readable, and visibly a link). Nothing where they don't agree.
 */
export default function TimelineHoldLine({
    marcherIds,
}: {
    marcherIds: readonly number[];
}) {
    const { t } = useTranslate();
    const state = useSelectionHoldState(marcherIds);
    let line: ReactNode = null;
    if (state?.kind === "movesHere")
        line = (
            <p
                className="text-body text-text px-6 leading-none"
                data-testid="timeline-hold-line"
            >
                {t("inspector.marcher.timeline.movesOnThisPage", {
                    defaultValue: "Moves on this page",
                })}
            </p>
        );
    else if (state) {
        const { page: holdPage, fromStart } = state;
        line = (
            <p className="flex flex-wrap items-center gap-6 px-6 leading-none">
                <ShortcutTooltip
                    side="bottom"
                    closeOnPress
                    label={
                        fromStart
                            ? t("inspector.marcher.timeline.goToStart", {
                                  defaultValue: "Go to the start",
                              })
                            : t("inspector.marcher.timeline.goToPage", {
                                  defaultValue:
                                      "Go to Page {page}, where these marchers last moved",
                                  page: holdPage.name,
                              })
                    }
                >
                    <button
                        type="button"
                        className={LINK_CLASS}
                        data-timeline-own-keys={OWN_KEYS_WITH_SPACE}
                        data-testid="timeline-hold-line"
                        // The go-to-page navigation: the playhead to the page's flag
                        onClick={() =>
                            useTimelineSelectionStore
                                .getState()
                                .seek(holdPage.beat)
                        }
                    >
                        {fromStart
                            ? t("inspector.marcher.timeline.holdFromStart", {
                                  defaultValue: "No moves since the start",
                              })
                            : t("inspector.marcher.timeline.holdFrom", {
                                  defaultValue: "Last moved on Page {page}",
                                  page: holdPage.name,
                              })}
                        <ArrowRightIcon size={14} aria-hidden />
                    </button>
                </ShortcutTooltip>
            </p>
        );
    }
    if (!line) return null;
    return (
        <TransportTooltipProvider disableHoverableContent>
            {line}
        </TransportTooltipProvider>
    );
}
