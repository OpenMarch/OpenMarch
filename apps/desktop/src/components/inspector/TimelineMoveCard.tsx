import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
    ArrowLineRightIcon,
    TrashIcon,
    UsersThreeIcon,
} from "@phosphor-icons/react";
import clsx from "clsx";
import { Button, Input } from "@openmarch/ui";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { db } from "@/global/database/db";
import { useTimingObjects } from "@/hooks/useTimingObjects";
import {
    autoMoveNumber,
    MOVE_NAME_MAX_LENGTH,
    moveLabels,
} from "@/timeline/timelineViewModel";
import { useTimelineViewVersions } from "@/timeline/useTimelineViewVersions";
import { clampBulge } from "@/timeline/timelineTransitionEditor";
import { DEFAULT_BULGE } from "@/timeline/timelinePathDefaults";
import {
    readMovePath,
    setMovePath,
    type MovePath,
    type MovePathStyle,
} from "@/db-functions/timelineCommands";
import { toastTimelineError } from "@/timeline/timelineErrorMessages";
import { isolatedTimelineName } from "@/components/timeline/TimelineIsolationBar";
import { useMoveCommands } from "@/components/timeline/useTimelineCommands";
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
} from "./TimelineInspectorSection";
import { useTimelineMode } from "@/hooks/queries/useWorkspaceSettings";
import { BulgeEditor, Field, Help } from "./TimelineTransitionEditor";

const MOVE_PATH_STYLES: readonly MovePathStyle[] = ["direct", "arc"];

/**
 * A move's path, read again after every timeline edit, undo and redo; `null` until first read.
 */
function useMovePath(timelineId: number): MovePath | null {
    const { version, displayVersion } = useTimelineViewVersions();
    const [path, setPath] = useState<MovePath | null>(null);
    useEffect(() => {
        let current = true;
        readMovePath(db, timelineId).then(
            (read) => {
                if (current) setPath(read);
            },
            (error: unknown) =>
                console.error("Couldn't read the move's path", error),
        );
        return () => {
            current = false;
        };
    }, [timelineId, version, displayVersion]);
    return path;
}

/** The app's focus ring, for the card's controls (UI-14 review) */
const FOCUS_RING = "focus-visible:ring-accent focus-visible:ring-2";

/**
 * The Move card's Path, a radio group (UI-14 review): the arrows move the choice and apply it, as
 * radios do; Enter or a click applies the focused one. Nothing is chosen while members differ or
 * all follow the leader.
 */
export function MovePathRadios({
    value,
    disabled,
    label,
    optionLabel,
    onChange,
}: {
    value: MovePathStyle | null;
    disabled: boolean;
    label: string;
    optionLabel: (style: MovePathStyle) => string;
    onChange: (style: MovePathStyle) => void;
}) {
    const refs = useRef<(HTMLButtonElement | null)[]>([]);
    const focusable = value === null ? 0 : MOVE_PATH_STYLES.indexOf(value);
    return (
        <div
            role="radiogroup"
            aria-label={label}
            data-testid="timeline-move-card-path"
            className="rounded-6 border-stroke flex border p-2"
        >
            {MOVE_PATH_STYLES.map((style, index) => (
                <button
                    key={style}
                    ref={(el) => {
                        refs.current[index] = el;
                    }}
                    type="button"
                    role="radio"
                    aria-checked={value === style}
                    tabIndex={index === focusable ? 0 : -1}
                    disabled={disabled}
                    onClick={() => {
                        if (style !== value) onChange(style);
                    }}
                    onKeyDown={(event) => {
                        const step =
                            event.key === "ArrowRight" ||
                            event.key === "ArrowDown"
                                ? 1
                                : event.key === "ArrowLeft" ||
                                    event.key === "ArrowUp"
                                  ? -1
                                  : 0;
                        if (step === 0) return;
                        event.preventDefault();
                        const next =
                            (index + step + MOVE_PATH_STYLES.length) %
                            MOVE_PATH_STYLES.length;
                        refs.current[next]?.focus();
                        onChange(MOVE_PATH_STYLES[next]!);
                    }}
                    className={clsx(
                        "text-sub rounded-4 px-8 py-4 outline-hidden disabled:opacity-50",
                        FOCUS_RING,
                        value === style
                            ? "bg-accent text-text-invert"
                            : "hover:bg-fg-2",
                    )}
                >
                    {optionLabel(style)}
                </button>
            ))}
        </div>
    );
}

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
 * counts, its **Path** for every marcher in it at once (Direct, or Arc with one bend; "Follow the
 * leader" shown when all of them follow, "Mixed" when they differ), how to change where they end
 * up, who is in it with **Select them**, and **Delete move**. **Edit move** brings it into view
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
    const stored = timeline.name ?? "";
    const [name, setName] = useState(stored);
    // The stored name changed (a rename here or on the clip, an undo): show it
    useEffect(() => setName(stored), [stored, timeline.id]);
    // Its label ("Move 2"), shown while the field is empty
    const defaultLabel = useTimelineSelectionStore(
        (s) =>
            moveLabels(s.storedTimelines ?? [], s.pageBoxes).get(timeline.id) ??
            "Move",
    );
    // Why the clip is dashed, when it is (UI-14 review)
    const overridden = useMoveNotesStore((s) => s.overridden.get(timeline.id));
    // Only whether P is at the move's end, so the card doesn't render on every beat played
    const atEnd = useTimelineSelectionStore(
        (s) => s.playheadBeat === timeline.end,
    );
    const path = useMovePath(timeline.id);
    // One path edit at a time; a choice made meanwhile (the arrows pressed again) goes next. The
    // controls stay enabled while one is written, so a focused radio keeps focus (UI-14 round-2
    // review: disabling it dropped focus to the page, where the next key went to the canvas)
    const pathWriting = useRef(false);
    const nextPath = useRef<{ style: MovePathStyle; bulge?: number } | null>(
        null,
    );
    const editPath = (style: MovePathStyle, bulge?: number) => {
        if (pathWriting.current) {
            nextPath.current = { style, bulge };
            return;
        }
        pathWriting.current = true;
        setMovePath({ db, timelineId: timeline.id, style, bulge })
            .catch((error: unknown) => toastTimelineError(error))
            .finally(() => {
                pathWriting.current = false;
                const next = nextPath.current;
                nextPath.current = null;
                if (next) editPath(next.style, next.bulge);
            });
    };
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
                    {isolatedTimelineName(timeline, pages)}
                </p>
            </Field>
            <Field label={t("inspector.timeline.move.path")}>
                <div className="flex items-center gap-8">
                    <MovePathRadios
                        value={
                            path?.style === "direct" || path?.style === "arc"
                                ? path.style
                                : null
                        }
                        disabled={!path?.transitions}
                        label={t("inspector.timeline.move.path")}
                        optionLabel={(style) =>
                            t(`inspector.timeline.pathStyle.${style}`)
                        }
                        onChange={(style) => editPath(style)}
                    />
                    {path?.style === "mixed" && (
                        <span
                            className="text-sub text-text/60"
                            data-testid="timeline-move-card-path-mixed"
                        >
                            {t("inspector.timeline.move.pathMixed")}
                        </span>
                    )}
                    {/* Code review: every member following the leader is one path, not Mixed;
                        shown as it is, and Direct or Arc still changes them all */}
                    {path?.style === "follow_the_leader" && (
                        <span
                            className="text-sub text-text/60"
                            data-testid="timeline-move-card-path-follow"
                        >
                            {t(
                                "inspector.timeline.pathStyle.follow_the_leader",
                            )}
                        </span>
                    )}
                </div>
            </Field>
            {path?.style === "arc" && (
                <BulgeEditor
                    bulge={path.bulge ?? DEFAULT_BULGE}
                    disabled={!path?.transitions}
                    t={t}
                    onCommit={(value) => {
                        const bulge = clampBulge(value);
                        if (bulge !== null) editPath("arc", bulge);
                    }}
                />
            )}
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
 * window is a move (UI-14 review), isolated or not. Only in timeline mode.
 */
export function TimelineMoveCardSlot() {
    const timelineMode = useTimelineMode();
    if (!timelineMode) return null;
    return <MoveCardSlotContent />;
}

function MoveCardSlotContent() {
    const t = useInspectorTranslate();
    // The move the Timeline section is about, held with it while the playhead is scrubbed, so the
    // two never differ and the card doesn't go (saving a typed name) mid-scrub (code review)
    const { move } = useSettledInspectorWindow();
    return move ? (
        <TimelineMoveCard key={move.id} timeline={move} t={t} />
    ) : null;
}
