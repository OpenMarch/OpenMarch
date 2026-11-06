import { useMemo, type ReactNode } from "react";
import { useTranslate } from "@tolgee/react";
import { ArrowRightIcon } from "@phosphor-icons/react";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useTimingObjects } from "@/hooks";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import {
    heldSince,
    marcherHoldState,
    sharedHoldState,
    withHoldKind,
    type HoldState,
    type NamedFlag,
} from "@/timeline/timelineHoldState";
import { holdTerms } from "@/timeline/holdTerms";
import { useHeldMarksStore } from "@/timeline/useHeldMarks";
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
import { getButtonClassName } from "@openmarch/ui";
import ActionButton from "@/shortcuts/ActionButton";
import { useExpertHolds } from "@/timeline/useExpertHolds";
import type { DragOutcome, DragPreview } from "@/timeline/holdDragPreview";

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
        let carried: Set<number> | null = null;
        const carriedOnFlag = (id: number) => {
            carried ??= new Set(
                placedBoxesAt(current.flag, recipes).flatMap((box) =>
                    box.recipe.members.map((m) => m.marcherId),
                ),
            );
            return carried.has(id);
        };
        // Where the Held mark over the flag starts (Hold from previous page: this page only, R3)
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
 * page its Held mark starts on (holds review R3); a carried
 * shape, or a mix, keeps "Last moved on Page 2". Nothing where they don't agree.
 *
 * With some selected marchers Held at the playhead (fork #476; holds review R1, 04-anchors
 * "Display"), it also says, before a drag, what the drag will do (`DragPreviewLines`): how many
 * are Held where only some are, with **Make all selected Held**, and what a drag does to each
 * kind. No toast: a mixed drag edits each marcher by its own kind.
 */
export default function TimelineHoldLine({
    marcherIds,
}: {
    marcherIds: readonly number[];
}) {
    const { t } = useTranslate();
    const state = useSelectionHoldState(marcherIds);
    const expert = useExpertHolds(marcherIds);
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
                            : state.how === "held"
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
    const preview = expert.preview && (
        <DragPreviewLines
            preview={expert.preview}
            canMakeHeld={expert.makeHeld > 0}
        />
    );
    if (!line && !preview) return null;
    return (
        <TransportTooltipProvider disableHoverableContent>
            {line}
            {preview}
        </TransportTooltipProvider>
    );
}

/** One thing a drag would do, as the inspector says it. */
function outcomeText(t: Translate, outcome: DragOutcome): string {
    if (outcome.kind === "addsMove")
        return t("inspector.marcher.timeline.dragAddsMove", {
            defaultValue: "adds a move on Page {page}",
            page: outcome.page,
        });
    if (outcome.page === null)
        return t("inspector.marcher.timeline.dragMovesStart", {
            defaultValue: "moves the starting position",
        });
    return t("inspector.marcher.timeline.dragMovesPage", {
        defaultValue: "moves Page {page}'s position",
        page: outcome.page,
    });
}

/**
 * What a drag at the playhead will do, before it starts (fork #476): "1 of 2 selected Held" with
 * **Make all selected Held** where only some are Held, then "Drag: moves Page 2's position · adds a
 * move on Page 4".
 */
function DragPreviewLines({
    preview,
    canMakeHeld,
}: {
    preview: DragPreview;
    canMakeHeld: boolean;
}) {
    const { t } = useTranslate();
    const mixed = preview.held < preview.total;
    return (
        <div
            className="flex flex-col gap-6 px-6"
            data-testid="timeline-drag-preview"
        >
            {mixed && (
                <div className="flex flex-wrap items-center gap-8">
                    <p
                        className="text-body text-text leading-none"
                        data-testid="timeline-held-count"
                    >
                        {t("inspector.marcher.timeline.heldOfSelected", {
                            defaultValue: "{count} of {total} selected {held}",
                            ...holdTerms(),
                            count: preview.held,
                            total: preview.total,
                        })}
                    </p>
                    {canMakeHeld && (
                        <ActionButton
                            action="timelineMakeSelectedHeld"
                            className={getButtonClassName({
                                variant: "secondary",
                                size: "compact",
                            })}
                        >
                            {t("inspector.marcher.timeline.makeSelectedHeld", {
                                defaultValue: "Make all selected {held}",
                                ...holdTerms(),
                            })}
                        </ActionButton>
                    )}
                </div>
            )}
            <p
                className="text-sub text-text-subtitle leading-none"
                data-testid="timeline-drag-outcomes"
            >
                {t("inspector.marcher.timeline.dragPreview", {
                    defaultValue: "Drag: {outcomes}",
                    outcomes: preview.outcomes
                        .map((o) => outcomeText(t, o))
                        .join(" · "),
                })}
            </p>
        </div>
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
    if (how === "held")
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
