/**
 * The transport's Previous, Play and Next (UI-17), with their tooltips' guides. The timeline's
 * transport and the 3D View window's both show them, each with its own callbacks; they need a
 * `TransportTooltipProvider` above them.
 */
import {
    type MouseEvent as ReactMouseEvent,
    type ReactNode,
    memo,
    useCallback,
    useEffect,
    useState,
} from "react";
import {
    ArrowLineLeftIcon,
    ArrowLineRightIcon,
    CaretLeftIcon,
    CaretRightIcon,
    PauseIcon,
    PlayIcon,
    SkipBackIcon,
    SkipForwardIcon,
    StopIcon,
} from "@phosphor-icons/react";
import clsx from "clsx";
import { Keycaps, ShortcutTooltip } from "./ShortcutTooltip";
import { isMac } from "./platform";
import { START_INK } from "./startFlagInk";
import type { TimelineNavigation } from "./TimelineViewModel";

// The same elements every render, so the memoized transport buttons don't re-render for them
const SKIP_BACK_ICON = <SkipBackIcon size={16} />;
const STOP_ICON = <StopIcon size={16} weight="fill" />;
const PAUSE_ICON = <PauseIcon size={16} weight="fill" />;
const SKIP_FORWARD_ICON = <SkipForwardIcon size={16} />;
// Previous and Next while Shift (the start or end of the show) or Alt (a beat) is held
const START_ICON = <ArrowLineLeftIcon size={16} />;
const END_ICON = <ArrowLineRightIcon size={16} />;
const BEAT_BACK_ICON = <CaretLeftIcon size={16} weight="bold" />;
const BEAT_FORWARD_ICON = <CaretRightIcon size={16} weight="bold" />;
const PLAY_ICON = <PlayIcon size={16} weight="fill" />;
/** Play while Shift is held: a bar, the playhead's line, then Play ("play from the playhead") */
const PLAY_FROM_PLAYHEAD_ICON = (
    <span className="flex items-center gap-2">
        <span aria-hidden className="rounded-2 bg-text h-14 w-[2.5px]" />
        <PlayIcon size={14} weight="fill" />
    </span>
);

/**
 * Play while Alt is held (UI-26): the start flag's bar, then Play, then on ("play on from the start
 * flag", past the playhead)
 */
const PLAY_ON_ICON = (
    <span className="flex items-center gap-2">
        <span
            aria-hidden
            className={clsx("rounded-2 h-14 w-[2.5px]", START_INK.bg)}
        />
        <PlayIcon size={14} weight="fill" />
    </span>
);

/**
 * The transport's shortcuts as the tooltips show them (UI-17), as keycaps joined with " + ". They
 * mirror the actions' default bindings (`shortcuts/definitions.ts`), which a test checks; this
 * file doesn't import the app's shortcut registry. A rebound shortcut isn't shown here.
 */
export const TRANSPORT_SHORTCUTS = {
    previousPage: "Q",
    nextPage: "E",
    firstPage: "Alt + Q",
    lastPage: "Alt + E",
    previousBeat: "Shift + Q",
    nextBeat: "Shift + E",
    play: "Space",
    playPage: "Shift + Space",
    playOn: "Alt + Space",
    loop: "C",
} as const;

export const TransportButton = memo(function TransportButton({
    label,
    shortcut,
    hint,
    hideLabel,
    keyShortcut,
    children,
    onClick,
    pressed,
    testId,
    navigation,
}: {
    label: string;
    /** The shortcut the tooltip shows as keycaps */
    shortcut?: string;
    /** A second tooltip line, or a guide */
    hint?: ReactNode;
    /** The shortcut for assistive tech when the tooltip shows it elsewhere (in a guide) */
    keyShortcut?: string;
    /** The tooltip is just `hint`, without the label above it */
    hideLabel?: boolean;
    children: ReactNode;
    onClick?: (event: ReactMouseEvent) => void;
    pressed?: boolean;
    testId?: string;
    /** Previous or Next (`useHeldNavigationMode`) */
    navigation?: boolean;
}) {
    return (
        <ShortcutTooltip
            label={label}
            shortcut={shortcut}
            hint={hint}
            hideLabel={hideLabel}
        >
            <button
                type="button"
                aria-label={label}
                aria-keyshortcuts={(shortcut ?? keyShortcut)?.replace(
                    /\s*\+\s*/g,
                    "+",
                )}
                aria-pressed={pressed}
                data-testid={testId}
                {...(navigation ? { [NAVIGATION_BUTTON_ATTRIBUTE]: "" } : {})}
                // UI-17 follow-up: a click doesn't take keyboard focus, so Space after clicking
                // a transport button is still the app's Play, not a second press of the button
                onMouseDown={(event) => event.preventDefault()}
                onClick={onClick}
                disabled={!onClick}
                className={clsx(
                    "focus-visible:ring-accent rounded-4 enabled:hover:text-accent enabled:hover:bg-fg-2 flex size-24 items-center justify-center outline-hidden transition-[color,background-color,transform] duration-150 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent enabled:active:translate-y-px disabled:cursor-not-allowed disabled:opacity-30",
                    pressed ? "text-accent" : "text-text",
                )}
            >
                {children}
            </button>
        </ShortcutTooltip>
    );
});

/** What Previous and Next do: step a page, or with Shift a beat, with Alt go to the start or end */
type TransportNavigationMode = "page" | "edge" | "beat";

const navigationMode = (event: {
    readonly shiftKey: boolean;
    readonly altKey: boolean;
}): TransportNavigationMode =>
    event.altKey ? "edge" : event.shiftKey ? "beat" : "page";

/**
 * Marks Previous and Next, and Play when Alt plays on (UI-26), so a held Alt over them can be kept
 * from the menu bar
 */
const NAVIGATION_BUTTON_ATTRIBUTE = "data-transport-navigation";

/**
 * On Windows and Linux, a held Alt over a button that reads it is kept from the menu bar
 * (`useHeldNavigationMode`)
 */
const keepAltFromMenu = (event: KeyboardEvent) => {
    if (
        event.key === "Alt" &&
        !isMac() &&
        document.querySelector(`[${NAVIGATION_BUTTON_ATTRIBUTE}]:hover`)
    )
        event.preventDefault();
};

/**
 * The modifier held now, as Previous and Next would read it. Only a change re-renders, so key
 * repeats and other keys cost nothing; losing focus lets go of it. A pointer event re-reads it
 * too, in case the window missed a key going up.
 *
 * On Windows and Linux the window's menu bar hides until Alt is pressed and let go on its own, so
 * holding Alt over Previous or Next to see the start and end would open the menu and take the
 * keyboard. Over those two buttons the app keeps Alt to itself: Electron only lets the menu see
 * keys the page didn't handle.
 */
function useHeldNavigationMode(enabled: boolean): TransportNavigationMode {
    const [mode, setMode] = useState<TransportNavigationMode>("page");
    useEffect(() => {
        if (!enabled) return;
        const read = (event: KeyboardEvent | PointerEvent) =>
            setMode(
                event.ctrlKey || event.metaKey ? "page" : navigationMode(event),
            );
        const onKey = (event: KeyboardEvent) => {
            keepAltFromMenu(event);
            read(event);
        };
        const onBlur = () => setMode("page");
        window.addEventListener("keydown", onKey, true);
        window.addEventListener("keyup", onKey, true);
        window.addEventListener("pointermove", read, true);
        window.addEventListener("pointerdown", read, true);
        window.addEventListener("blur", onBlur);
        return () => {
            window.removeEventListener("keydown", onKey, true);
            window.removeEventListener("keyup", onKey, true);
            window.removeEventListener("pointermove", read, true);
            window.removeEventListener("pointerdown", read, true);
            window.removeEventListener("blur", onBlur);
            setMode("page");
        };
    }, [enabled]);
    return mode;
}

/** What Play does: Space, Shift+Space (from the playhead, or pause) or Alt+Space (play on, UI-26) */
type TransportPlayMode = "play" | "shift" | "alt";

const playMode = (
    event: {
        readonly shiftKey: boolean;
        readonly altKey: boolean;
        readonly ctrlKey: boolean;
        readonly metaKey: boolean;
    },
    alt: boolean,
): TransportPlayMode =>
    event.ctrlKey || event.metaKey
        ? "play"
        : event.shiftKey
          ? "shift"
          : alt && event.altKey
            ? "alt"
            : "play";

/**
 * The modifier held now, as Play would read it (`useHeldNavigationMode`'s rules: only a change
 * re-renders, losing focus lets go, a pointer event re-reads it). Alt counts only when `alt`.
 */
function useHeldPlayMode(enabled: boolean, alt: boolean): TransportPlayMode {
    const [mode, setMode] = useState<TransportPlayMode>("play");
    useEffect(() => {
        if (!enabled) return;
        const read = (event: KeyboardEvent | PointerEvent) =>
            setMode(playMode(event, alt));
        const onKey = (event: KeyboardEvent) => {
            if (alt) keepAltFromMenu(event);
            read(event);
        };
        const onBlur = () => setMode("play");
        window.addEventListener("keydown", onKey, true);
        window.addEventListener("keyup", onKey, true);
        window.addEventListener("pointermove", read, true);
        window.addEventListener("pointerdown", read, true);
        window.addEventListener("blur", onBlur);
        return () => {
            window.removeEventListener("keydown", onKey, true);
            window.removeEventListener("keyup", onKey, true);
            window.removeEventListener("pointermove", read, true);
            window.removeEventListener("pointerdown", read, true);
            window.removeEventListener("blur", onBlur);
            setMode("play");
        };
    }, [enabled, alt]);
    return mode;
}

const NAVIGATION_TARGETS = {
    page: ["previous-page", "next-page"],
    edge: ["first-page", "last-page"],
    beat: ["previous-beat", "next-beat"],
} as const satisfies Record<
    TransportNavigationMode,
    readonly [TimelineNavigation, TimelineNavigation]
>;

interface TransportGuideRow<Mode extends string = string> {
    readonly mode: Mode;
    readonly icon: ReactNode;
    /** What it does, for the button's name */
    readonly label: string;
    /** What the guide shows instead of `label`, with the lines' marks inline */
    readonly content?: ReactNode;
    /** The shortcut as keycaps */
    readonly shortcut: string;
}

/** What Previous (or Next) does with each modifier, in the order the tooltip lists them */
const navigationGuide = (
    back: boolean,
): readonly TransportGuideRow<TransportNavigationMode>[] => {
    const alt = isMac() ? "Option" : "Alt";
    return [
        {
            mode: "page",
            icon: back ? SKIP_BACK_ICON : SKIP_FORWARD_ICON,
            label: back ? "Previous page" : "Next page",
            shortcut: back
                ? TRANSPORT_SHORTCUTS.previousPage
                : TRANSPORT_SHORTCUTS.nextPage,
        },
        {
            mode: "beat",
            icon: back ? BEAT_BACK_ICON : BEAT_FORWARD_ICON,
            label: back ? "Previous beat" : "Next beat",
            shortcut: back
                ? TRANSPORT_SHORTCUTS.previousBeat
                : TRANSPORT_SHORTCUTS.nextBeat,
        },
        {
            mode: "edge",
            icon: back ? START_ICON : END_ICON,
            label: back ? "Start of the show" : "End of the show",
            shortcut: (back
                ? TRANSPORT_SHORTCUTS.firstPage
                : TRANSPORT_SHORTCUTS.lastPage
            ).replace("Alt", alt),
        },
    ];
};

/**
 * The tooltip's guide to Previous, Play or Next: each icon, what it does, its shortcut and its
 * click, with the row the held modifier picks in the accent color.
 */
function TransportGuide({
    rows,
    mode,
    testId,
}: {
    rows: readonly TransportGuideRow[];
    mode: string;
    testId: string;
}) {
    return (
        <span
            data-testid={testId}
            className="grid w-max grid-cols-[auto_auto_auto] items-center gap-x-8 gap-y-4"
        >
            {rows.map((row) => (
                <span
                    key={row.mode}
                    data-active={row.mode === mode || undefined}
                    className={clsx(
                        "col-span-3 grid grid-cols-subgrid items-center",
                        row.mode === mode ? "text-accent" : "text-text",
                    )}
                >
                    <span aria-hidden="true" className="flex">
                        {row.icon}
                    </span>
                    <span className="flex items-center gap-4 text-[12px]">
                        {row.content ?? row.label}
                    </span>
                    <Keycaps shortcut={row.shortcut} />
                </span>
            ))}
        </span>
    );
}

/**
 * Previous and Next. Q and E step a page; Shift (Shift+click, Shift+Q/E) steps a beat and Alt
 * (Alt+click, Alt+Q/E, also Home and End) goes to the start or end of the show. Holding either modifier swaps the icon
 * and label to say so, and the tooltip is a guide to all three (`TransportGuide`). Kept apart
 * from the transport so only these two re-render for it.
 */
export const TransportNavigationButton = memo(
    function TransportNavigationButton({
        direction,
        onNavigate,
        testIdPrefix = "timeline",
    }: {
        direction: "previous" | "next";
        onNavigate?: (direction: TimelineNavigation) => void;
        /** "timeline" in the editor, "view3d" in the 3D View window */
        testIdPrefix?: string;
    }) {
        const mode = useHeldNavigationMode(onNavigate != null);
        const back = direction === "previous";
        const onClick = useCallback(
            (event: ReactMouseEvent) =>
                onNavigate?.(
                    NAVIGATION_TARGETS[navigationMode(event)][back ? 0 : 1],
                ),
            [back, onNavigate],
        );
        const guide = navigationGuide(back);
        const row = guide.find((r) => r.mode === mode)!;
        return (
            <TransportButton
                label={row.label}
                keyShortcut={row.shortcut}
                hideLabel
                hint={
                    <TransportGuide
                        rows={guide}
                        mode={mode}
                        testId={`${testIdPrefix}-navigation-guide`}
                    />
                }
                testId={`${testIdPrefix}-${direction}`}
                navigation
                onClick={onNavigate ? onClick : undefined}
            >
                {row.icon}
            </TransportButton>
        );
    },
);

/** The start flag as the timeline draws it, a pennant on its stem, for the guide's words */
const START_FLAG_MARK = (
    <svg
        aria-hidden="true"
        data-mark="start-flag"
        width="9"
        height="13"
        viewBox="0 0 9 13"
        className={clsx("shrink-0", START_INK.text)}
    >
        <rect x="0" y="0" width="1.5" height="13" fill="currentColor" />
        <path d="M0 0 L9 0 L0 9 Z" fill="currentColor" />
    </svg>
);

/** The playhead as the timeline draws it, its head on its line, for the guide's words */
const PLAYHEAD_MARK = (
    <svg
        aria-hidden="true"
        data-mark="playhead"
        width="10"
        height="13"
        viewBox="0 0 10 13"
        className="text-accent shrink-0"
    >
        <rect x="4.25" y="0" width="1.5" height="13" fill="currentColor" />
        <path d="M0 0 H10 V5 L5 9 L0 5 Z" fill="currentColor" />
    </svg>
);

/** "Play from start flag ⚑ and continue", with the lines' marks after their names (owner) */
const playWords = (
    from: "start" | "playhead",
    stopAtPlayhead: boolean,
): { label: string; content: ReactNode } => {
    const name = from === "start" ? "start flag" : "playhead";
    const end = stopAtPlayhead ? "stop at playhead" : "continue";
    return {
        label: `Play from ${name} and ${end}`,
        content: (
            <>
                Play from {name}
                {from === "start" ? START_FLAG_MARK : PLAYHEAD_MARK}
                and {end}
                {stopAtPlayhead && PLAYHEAD_MARK}
            </>
        ),
    };
};

/**
 * What Play (Space), Alt+Play (Alt+Space, with `playsOn`) and Shift+Play (Shift+Space) do, in the
 * order the tooltip lists them (owner, 2026-10-19). With `playsOn` (Expert, UI-26) Space stops at
 * the playhead and Alt continues past it; without (Basic, the 3D View) Space continues from the
 * start flag. With looping on, Space and Shift+Space name the loop.
 */
const playGuide = (
    loops: boolean,
    playsOn: boolean,
): readonly TransportGuideRow<TransportPlayMode>[] => [
    {
        mode: "play",
        icon: PLAY_ICON,
        ...(loops ? { label: "Play the loop" } : playWords("start", playsOn)),
        shortcut: TRANSPORT_SHORTCUTS.play,
    },
    ...(playsOn
        ? [
              {
                  mode: "alt" as const,
                  icon: PLAY_ON_ICON,
                  ...playWords("start", false),
                  shortcut: TRANSPORT_SHORTCUTS.playOn.replace(
                      "Alt",
                      isMac() ? "Option" : "Alt",
                  ),
              },
          ]
        : []),
    {
        mode: "shift",
        icon: PLAY_FROM_PLAYHEAD_ICON,
        ...(loops
            ? { label: "Play the loop once" }
            : playWords("playhead", false)),
        shortcut: TRANSPORT_SHORTCUTS.playPage,
    },
];

/** What Stop (Space) and Pause (Shift+Space) do while playing (UI-24) */
const stopGuide: readonly TransportGuideRow<TransportPlayMode>[] = [
    {
        mode: "play",
        icon: STOP_ICON,
        label: "Stop and go back",
        shortcut: TRANSPORT_SHORTCUTS.play,
    },
    {
        mode: "shift",
        icon: PAUSE_ICON,
        label: "Pause here",
        shortcut: TRANSPORT_SHORTCUTS.playPage,
    },
];

/**
 * Tempo mode's one Play (prototype; owner, 2026-10-30): one row, named for what it does now, and
 * Stop stays where it stopped
 */
const playOnlyGuide = (
    label: string,
    isPlaying: boolean,
): readonly TransportGuideRow<TransportPlayMode>[] => [
    isPlaying
        ? {
              mode: "play",
              icon: STOP_ICON,
              label: "Stop here",
              shortcut: TRANSPORT_SHORTCUTS.play,
          }
        : {
              mode: "play",
              icon: PLAY_ICON,
              label,
              shortcut: TRANSPORT_SHORTCUTS.play,
          },
];

/**
 * Play, or Stop while playing. Shift+click is Shift+Space: plays from the playhead, or the loop
 * once; while playing, it pauses where it is (UI-24), where Stop goes back to where Play was
 * pressed. Holding Shift swaps the icon and label to say so, and the tooltip is a guide to both, as
 * Previous and Next do. Kept apart from the transport so only this re-renders for Shift.
 */
export const TransportPlayButton = memo(function TransportPlayButton({
    isPlaying,
    onPlayingChange,
    playLoops,
    onPlayFromPlayhead,
    onPlayOn,
    playOnly,
    testIdPrefix = "timeline",
}: {
    isPlaying: boolean;
    onPlayingChange?: (isPlaying: boolean) => void;
    playLoops: boolean;
    onPlayFromPlayhead?: () => void;
    /** Alt+click (Alt+Space): plays on from the start flag past the playhead (Expert, UI-26) */
    onPlayOn?: () => void;
    /**
     * PROTOTYPE (tempo mode): Play is the only play action, named like this in its tooltip; Shift
     * and Alt clicks play the same way
     */
    playOnly?: string;
    /** "timeline" in the editor, "view3d" in the 3D View window */
    testIdPrefix?: string;
}) {
    const single = playOnly !== undefined;
    const playsOn = onPlayOn != null && !single;
    const held = useHeldPlayMode(onPlayingChange != null && !single, playsOn);
    const togglePlaying = useCallback(
        (event: ReactMouseEvent) => {
            if (single) {
                onPlayingChange?.(!isPlaying);
                return;
            }
            const clicked = playMode(event, playsOn);
            if (clicked === "shift" && onPlayFromPlayhead) onPlayFromPlayhead();
            // Playing, Alt+click stops, as Alt+Space does
            else if (clicked === "alt" && onPlayOn && !isPlaying) onPlayOn();
            else onPlayingChange?.(!isPlaying);
        },
        [
            isPlaying,
            onPlayingChange,
            onPlayFromPlayhead,
            onPlayOn,
            playsOn,
            single,
        ],
    );
    const onClick = onPlayingChange ? togglePlaying : undefined;
    const guide = single
        ? playOnlyGuide(playOnly, isPlaying)
        : isPlaying
          ? stopGuide
          : playGuide(playLoops, playsOn);
    const mode =
        held === "shift" && !onPlayFromPlayhead
            ? "play"
            : guide.some((r) => r.mode === held)
              ? held
              : "play";
    const row = guide.find((r) => r.mode === mode)!;
    return (
        <TransportButton
            label={row.label}
            keyShortcut={row.shortcut}
            hideLabel
            hint={
                <TransportGuide
                    rows={
                        onPlayFromPlayhead && !single
                            ? guide
                            : guide.slice(0, 1)
                    }
                    mode={mode}
                    testId={`${testIdPrefix}-${isPlaying ? "stop" : "play"}-guide`}
                />
            }
            testId={`${testIdPrefix}-play`}
            pressed={isPlaying}
            onClick={onClick}
            navigation={playsOn}
        >
            {row.icon}
        </TransportButton>
    );
});
