import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type KeyboardEvent,
} from "react";
import {
    ArrowLineRightIcon,
    ArrowsSplitIcon,
    ScissorsIcon,
    TrashIcon,
    UsersThreeIcon,
} from "@phosphor-icons/react";
import clsx from "clsx";
import { Button, Input } from "@openmarch/ui";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { db } from "@/global/database/db";
import tolgee from "@/global/singletons/Tolgee";
import { useTimingObjects } from "@/hooks/useTimingObjects";
import {
    autoMoveNumber,
    MOVE_NAME_MAX_LENGTH,
    moveLabels,
} from "@/timeline/timelineViewModel";
import { isolatedTimelineName } from "@/components/timeline/TimelineIsolationBar";
import { useMoveCommands } from "@/components/timeline/useTimelineCommands";
import { useSplitMergeCommands } from "@/components/timeline/useSplitMergeMoves";
import {
    selectedMembers,
    splitEntryState,
    splitMergeContext,
} from "@/components/timeline/splitMergeMoves";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useIsBasicMode } from "@/stores/EditorModeStore";
import { spaceStaysPlay } from "@/components/timeline/timelineHotkeys";
import { useMoveCardRevealStore } from "@/stores/MoveCardRevealStore";
import { useMoveNotesStore } from "@/stores/MoveNotesStore";
import {
    useTimelineSelectionStore,
    type StoredTimelineMembership,
} from "@/stores/TimelineSelectionStore";
import {
    useInspectorTranslate,
    useSettledInspectorWindow,
    type InspectorTranslate,
} from "./inspectorHooks";
import { Field, Help } from "./InspectorFields";

/** The app's focus ring, for the card's controls (UI-14 review) */
const FOCUS_RING = "focus-visible:ring-accent focus-visible:ring-2";

/**
 * Whether a name typed in the Move card is an edit to save: changed, and not cleared while the
 * move has its automatic "Move N" (which it keeps). A rename sent twice (a blur, then the card going
 * before the stored name catches up) is still one edit: `renameTimeline` compares with the stored
 * name under the write lock and writes nothing the second time.
 */
const isNameEdit = (typed: string, stored: string) =>
    typed.trim() !== stored.trim() &&
    !(typed.trim() === "" && autoMoveNumber(stored) !== null);

/** How long **Edit move**'s highlight stays on the card */
const REVEAL_FLASH_MS = 1200;

/** How long the card waits for the inspector to lay out before scrolling to it */
const REVEAL_SCROLL_DELAY_MS = 120;

/**
 * The Move card (UI-14), first in the inspector, above the page and marcher editors and the
 * Timeline section, while the window is a move with a clip (`TimelineMoveCardSlot`): its name
 * (Enter or leaving the field saves, Esc goes back; empty clears it), when it happens in pages and
 * counts, how to change where they end up, who is in it with **Select them**, and **Delete move**. **Edit move** brings it into view
 * (`useMoveCardRevealStore`): focus on its heading, a scroll and a brief highlight.
 */
export function TimelineMoveCard({
    timeline,
    t,
}: {
    timeline: StoredTimelineMembership;
    t: InspectorTranslate;
}) {
    const moves = useMoveCommands(db);
    const pages = useTimingObjects()?.pages ?? [];
    const isPlaying = useIsPlaying()?.isPlaying ?? false;
    // UI-25: **Split N selected into new move**, as in the clip's menu
    const selectedMarchers = useSelectedMarchers()?.selectedMarchers;
    const selectedKey = (selectedMarchers ?? []).map((m) => m.id).join(",");
    const selectedIds = useMemo(
        () =>
            new Set(
                selectedKey === "" ? [] : selectedKey.split(",").map(Number),
            ),
        [selectedKey],
    );
    const splitMerge = useSplitMergeCommands({
        database: db,
        selectedMarcherIds: selectedIds,
        isPlaying,
    });
    const basic = useIsBasicMode();
    const storedTimelines = useTimelineSelectionStore((s) => s.storedTimelines);
    const pageBoxes = useTimelineSelectionStore((s) => s.pageBoxes);
    const split = useMemo(
        () =>
            basic
                ? null
                : splitEntryState(
                      splitMergeContext(
                          { storedTimelines, pageBoxes },
                          selectedIds,
                          isPlaying,
                      ),
                      timeline.id,
                  ),
        [
            basic,
            storedTimelines,
            pageBoxes,
            selectedIds,
            isPlaying,
            timeline.id,
        ],
    );
    const stored = timeline.name ?? "";
    const [name, setName] = useState(stored);
    // The stored name changed (a rename here or on the clip, an undo): show it
    useEffect(() => setName(stored), [stored, timeline.id]);
    // Its label ("Move 2"), shown while the field is empty
    const defaultLabel =
        useTimelineSelectionStore((s) =>
            moveLabels(s.storedTimelines ?? [], s.pageBoxes).get(timeline.id),
        ) ?? tolgee.t("timeline.moveName.unnamed");
    // Why the clip is dashed, when it is (UI-14 review)
    const overridden = useMoveNotesStore((s) => s.overridden.get(timeline.id));
    // Only whether P is at the move's end, so the card doesn't render on every beat played
    const atEnd = useTimelineSelectionStore(
        (s) => s.playheadBeat === timeline.end,
    );
    // Split at playhead is on the card only while this move is isolated (UI-27): otherwise the
    // window ends at the playhead, so the playhead is never inside the move the card is about
    const isolated = useTimelineSelectionStore(
        (s) => s.isolation?.timelineId === timeline.id,
    );
    // Likewise only whether P is strictly inside the move: the split needs that
    const playheadInside = useTimelineSelectionStore(
        (s) => timeline.start < s.playheadBeat && s.playheadBeat < timeline.end,
    );
    // The name last sent, until the stored name changes: Enter, the blur and the card going can
    // each send the same rename before it lands, and a refused one would say so each time
    const lastSent = useRef<string | null>(null);
    useEffect(() => {
        lastSent.current = null;
    }, [stored]);
    const send = (typed: string) => {
        if (typed === lastSent.current) return;
        lastSent.current = typed;
        void moves.renameMove(timeline.id, typed);
    };
    const commit = () => {
        // Nothing to write: the field shows the stored name again
        if (!isNameEdit(name, stored)) {
            setName(stored);
            return;
        }
        send(name);
    };
    // UI-14 review: a field that goes away before it blurs (a click on the timeline selects
    // another window first) still saves what was typed, unless Esc put the name back
    const pendingName = useRef({ name, stored, send });
    pendingName.current = { name, stored, send };
    useEffect(
        () => () => {
            const {
                name: typed,
                stored: was,
                send: save,
            } = pendingName.current;
            if (isNameEdit(typed, was)) save(typed);
        },
        [timeline.id],
    );

    const ref = useRef<HTMLElement>(null);
    const headingRef = useRef<HTMLHeadingElement>(null);
    const [flash, setFlash] = useState(false);
    // Each **Edit move** request for this card, taken once
    const [reveals, setReveals] = useState(0);
    const pending = useMoveCardRevealStore((s) => s.pending);
    useEffect(() => {
        if (pending !== timeline.id) return;
        useMoveCardRevealStore.getState().clear();
        setReveals((n) => n + 1);
    }, [pending, timeline.id]);
    useEffect(() => {
        if (reveals === 0) return;
        setFlash(true);
        // UI-14 review: focus goes to the card's heading, off the ⋯ button, so Space plays
        // instead of opening the menu again, and Tab goes on to the card's controls
        headingRef.current?.focus({ preventScroll: true });
        // Once the inspector has laid out
        const scroll = setTimeout(
            () =>
                ref.current?.scrollIntoView?.({
                    block: "start",
                    behavior: "smooth",
                }),
            REVEAL_SCROLL_DELAY_MS,
        );
        const timeout = setTimeout(() => setFlash(false), REVEAL_FLASH_MS);
        return () => {
            clearTimeout(scroll);
            clearTimeout(timeout);
        };
    }, [reveals]);

    const count = timeline.marcherIds.size;
    return (
        <section
            ref={ref}
            data-testid="timeline-move-card"
            data-flash={flash || undefined}
            // UI-14 review: Enter and the arrows work the card's controls, not the canvas
            data-timeline-own-keys="true"
            aria-label={t("inspector.timeline.move.title")}
            onKeyDown={spaceStaysPlay}
            onKeyUp={spaceStaysPlay}
            className={clsx(
                "rounded-6 border-stroke flex flex-col gap-12 border p-12 transition-shadow duration-300",
                flash && "ring-accent ring-2",
            )}
        >
            <h5
                ref={headingRef}
                tabIndex={-1}
                data-testid="timeline-move-card-heading"
                className="text-body focus-visible:ring-accent rounded-4 font-medium outline-hidden focus-visible:ring-2"
            >
                {defaultLabel}
            </h5>
            {overridden && (
                <Help testId="timeline-move-card-overridden">{overridden}</Help>
            )}
            <Field label={t("inspector.timeline.move.name")}>
                <Input
                    compact
                    data-testid="timeline-move-card-name"
                    aria-label={t("inspector.timeline.move.name")}
                    maxLength={MOVE_NAME_MAX_LENGTH}
                    placeholder={defaultLabel}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={commit}
                    onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                        // Its keys are its own: blurring first would hand Enter to the app's
                        // Enter shortcut (create a shape)
                        // UI-14 review: Enter saves and stays in the field
                        if (e.key === "Enter") {
                            e.preventDefault();
                            e.stopPropagation();
                            commit();
                        } else if (e.key === "Escape") {
                            // Back to the stored name, then leave without saving, to the
                            // card's heading (UI-14 round-2 review: focus stays in the card)
                            e.stopPropagation();
                            setName(stored);
                            requestAnimationFrame(() =>
                                headingRef.current?.focus({
                                    preventScroll: true,
                                }),
                            );
                        }
                    }}
                />
                {name.length >= MOVE_NAME_MAX_LENGTH && (
                    <Help testId="timeline-move-card-name-limit">
                        {t("inspector.timeline.move.nameLimit", {
                            max: MOVE_NAME_MAX_LENGTH,
                        })}
                    </Help>
                )}
            </Field>
            <Field label={t("inspector.timeline.move.counts")}>
                <p className="text-sub" data-testid="timeline-move-card-range">
                    {/* The card is only for moves, which may share a page box's range (UI-25) */}
                    {isolatedTimelineName(timeline, pages, true)}
                </p>
            </Field>
            <div className="flex flex-col gap-6">
                <Help testId="timeline-move-card-end-help">
                    {t("inspector.timeline.move.endHelp")}
                </Help>
                {!atEnd && (
                    <Button
                        size="compact"
                        variant="secondary"
                        className={clsx("w-fit", FOCUS_RING)}
                        data-testid="timeline-move-card-go-to-end"
                        disabled={isPlaying}
                        onClick={() =>
                            useTimelineSelectionStore
                                .getState()
                                .seek(timeline.end)
                        }
                    >
                        <ArrowLineRightIcon size={16} />
                        {t("inspector.timeline.move.goToEnd")}
                    </Button>
                )}
            </div>
            <div className="flex items-center justify-between gap-8">
                <p className="text-sub" data-testid="timeline-move-card-count">
                    {t("inspector.timeline.move.marchers", { count })}
                </p>
                <Button
                    size="compact"
                    variant="secondary"
                    className={FOCUS_RING}
                    data-testid="timeline-move-card-select"
                    disabled={count === 0}
                    onClick={() => void moves.selectMarchers(timeline.id)}
                >
                    <UsersThreeIcon size={16} />
                    {t("inspector.timeline.move.selectMarchers")}
                </Button>
            </div>
            {split && (
                <div className="flex flex-col gap-6">
                    <Button
                        size="compact"
                        variant="secondary"
                        className={clsx("w-fit whitespace-nowrap", FOCUS_RING)}
                        data-testid="timeline-move-card-split"
                        disabled={split.disabledReason !== null}
                        onClick={() =>
                            splitMerge.commands.split(
                                timeline.id,
                                selectedMembers(
                                    splitMerge.context(),
                                    timeline.id,
                                ),
                            )
                        }
                    >
                        <ArrowsSplitIcon size={16} />
                        {split.label}
                    </Button>
                    {split.disabledReason !== null && (
                        <Help testId="timeline-move-card-split-reason">
                            {split.disabledReason}
                        </Help>
                    )}
                </div>
            )}
            {isolated && (
                <div className="flex flex-col gap-6">
                    <Button
                        size="compact"
                        variant="secondary"
                        className={clsx("w-fit", FOCUS_RING)}
                        data-testid="timeline-move-card-split-at-playhead"
                        disabled={isPlaying || !playheadInside}
                        onClick={() =>
                            void moves.splitMoveAtPlayhead(
                                timeline.id,
                                isPlaying,
                            )
                        }
                    >
                        <ScissorsIcon size={16} />
                        {t("inspector.timeline.move.split")}
                    </Button>
                    {!isPlaying && !playheadInside && (
                        <Help>{t("inspector.timeline.move.splitHelp")}</Help>
                    )}
                </div>
            )}
            <div className="flex flex-col gap-6">
                <Button
                    size="compact"
                    variant="secondary"
                    className={clsx("text-red w-fit", FOCUS_RING)}
                    data-testid="timeline-move-card-delete"
                    disabled={isPlaying}
                    onClick={() => void moves.deleteMove(timeline.id)}
                >
                    <TrashIcon size={16} />
                    {t("inspector.timeline.move.delete")}
                </Button>
                {isPlaying && (
                    <Help>{t("inspector.timeline.move.paused")}</Help>
                )}
            </div>
        </section>
    );
}

/**
 * The Move card's place in the inspector: first, above the page and marcher editors, whenever the
 * window is a move (UI-14 review), isolated or not.
 */
export function TimelineMoveCardSlot() {
    const t = useInspectorTranslate();
    // The move the Timeline section is about, held with it while the playhead is scrubbed, so the
    // two never differ and the card doesn't go (saving a typed name) mid-scrub (code review)
    const { move } = useSettledInspectorWindow();
    return move ? (
        <TimelineMoveCard key={move.id} timeline={move} t={t} />
    ) : null;
}
