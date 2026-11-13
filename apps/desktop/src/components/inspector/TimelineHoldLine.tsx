import { useMemo, type ReactNode } from "react";
import { useTranslate } from "@tolgee/react";
import { ArrowRightIcon } from "@phosphor-icons/react";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useTimingObjects } from "@/hooks";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import {
    heldSince,
    marcherHoldState,
    readsHeld,
    sharedHoldState,
    withHoldKind,
    type HoldState,
    type NamedFlag,
} from "@/timeline/timelineHoldState";
import { holdTerms } from "@/timeline/holdTerms";
import { useHeldMarksStore } from "@/timeline/useHeldMarks";
import { carriedSince } from "@/timeline/timelineCarried";
import {
    placedBoxesAt,
    usePlacedBoxStore,
} from "@/shapes/placed/placedBoxStore";
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
import { useExpertHolds } from "@/timeline/useExpertHolds";

/**
 * The selection's state on the current page, in timeline mode (docs/timeline/ui.md UI-18):
 * moving on this page, or holding since Page X, where the selected marchers agree; nothing when
 * they don't. A hold says what decides it (`HoldKind`, fork #478) where every marcher agrees on
 * that too. The current page is the selected page, which follows the paused playhead
 * (`useTimelinePageBridge`).
 */
export function useSelectionHoldState(
    marcherIds: readonly number[],
): HoldState | null {
    const resolver = useTimelineResolverStore((s) => s.resolver);
    const version = useTimelineResolverStore((s) => s.version);
    const { pages } = useTimingObjects()!;
    const { selectedPage } = useSelectedPage()!;
    const marks = useHeldMarksStore((s) => s.marks);
    // Placed shapes are read from these, so a change to them is a new carried set
    const recipes = usePlacedBoxStore((s) => s.recipes);
    const ends = usePlacedBoxStore((s) => s.ends);
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
        void ends; // placedBoxesAt reads the end beats from the store
        // Where the shape carried onto the flag with the marcher in it was placed or last laid out
        let carried: Map<number, number> | null = null;
        const carriedOnFlag = (id: number) => {
            carried ??= carriedSince(placedBoxesAt(current.flag, recipes));
            const placed = carried.get(id);
            return placed === undefined ? null : heldSince(placed, flags);
        };
        // Where the Held mark over the flag starts (Hold from last keyframe: this page only, R3)
        const heldOnFlag = (id: number) => {
            const mark = marks.find(
                (m) =>
                    m.marcherId === id &&
                    m.start < current.flag &&
                    current.flag <= m.end,
            );
            return mark ? heldSince(mark.start, flags) : null;
        };
        return sharedHoldState(
            marcherIds.map((id) =>
                withHoldKind(
                    marcherHoldState(
                        resolverSpans(resolver, id),
                        current.flag,
                        flags,
                    ),
                    {
                        held: heldOnFlag(id),
                        carried: carriedOnFlag(id),
                    },
                ),
            ),
        );
    }, [
        resolver,
        version,
        pages,
        selectedPage,
        marcherIds,
        marks,
        recipes,
        ends,
    ]);
}

const LINK_CLASS =
    "text-body text-text decoration-text/40 hover:decoration-text focus-visible:ring-accent rounded-6 inline-flex items-center gap-4 leading-none underline underline-offset-4 focus-visible:ring focus-visible:outline-none";

/**
 * The marcher inspector's line for the selected marchers (UI-18), under Step Size: whether they
 * move on the current page or hold there, with a link to the page they last moved on
 * (defined-coordinates 08: readable, and visibly a link). A hold names its state in the working
 * words (`holdTerms`, fork #478): "Not defined · showing Page 2", or "Held · since Page 3" for the
 * page its Held mark starts on (holds review R3). A carried shape's members read Held too, since
 * the page the shape was placed or last laid out on (owner, holds wave 2), and the link goes
 * there. A mix of Held and Not defined keeps "Last moved on Page 2". Nothing where they don't
 * agree.
 *
 * How many of the selection are Held is `TimelineHeldCount`'s line, higher up.
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
                            : readsHeld(state.how)
                              ? t("inspector.marcher.timeline.goToHeldPage", {
                                    defaultValue:
                                        "Go to Page {page}, where this hold starts",
                                    page: holdPage.name,
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
                        {holdText(t, state)}
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

/**
 * Where only some of the selection is Held at the playhead (fork #476; holds review R1), how many:
 * "1 of 2 selected Held". A mixed drag edits each marcher by its own kind. It sits by the selected
 * marchers' numbers, at the top of the inspector, so it shows without scrolling (#805); the field's
 * editing label says it too.
 */
export function TimelineHeldCount({
    marcherIds,
}: {
    marcherIds: readonly number[];
}) {
    const { t } = useTranslate();
    const { partlyHeld } = useExpertHolds(marcherIds);
    if (!partlyHeld) return null;
    return (
        <p
            className="text-body text-text px-6 leading-none"
            data-testid="timeline-held-count"
        >
            {t("inspector.marcher.timeline.heldOfSelected", {
                defaultValue: "{count} of {total} selected {held}",
                ...holdTerms(),
                count: partlyHeld.held,
                total: partlyHeld.total,
            })}
        </p>
    );
}

type Translate = ReturnType<typeof useTranslate>["t"];

/** The hold link's words: the state that decides the hold, where known, and the page it shows. */
function holdText(
    t: Translate,
    state: Extract<HoldState, { kind: "holding" }>,
): string {
    const { page, fromStart, how } = state;
    if (how === "notDefined")
        return fromStart
            ? t("inspector.marcher.timeline.notDefinedFromStart", {
                  defaultValue: "{notDefined} · showing the start",
                  ...holdTerms(),
              })
            : t("inspector.marcher.timeline.notDefinedShowing", {
                  defaultValue: "{notDefined} · showing Page {page}",
                  ...holdTerms(),
                  page: page.name,
              });
    if (readsHeld(how))
        return fromStart
            ? t("inspector.marcher.timeline.heldFromStart", {
                  defaultValue: "{held} · since the start",
                  ...holdTerms(),
              })
            : t("inspector.marcher.timeline.heldSince", {
                  defaultValue: "{held} · since Page {page}",
                  ...holdTerms(),
                  page: page.name,
              });
    return fromStart
        ? t("inspector.marcher.timeline.holdFromStart", {
              defaultValue: "No moves since the start",
          })
        : t("inspector.marcher.timeline.holdFrom", {
              defaultValue: "Last moved on Page {page}",
              page: page.name,
          });
}
