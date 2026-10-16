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

/** Marks Previous and Next, so a held Alt over them can be kept from the menu bar */
const NAVIGATION_BUTTON_ATTRIBUTE = "data-transport-navigation";

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
            if (
                event.key === "Alt" &&
                !isMac() &&
                document.querySelector(`[${NAVIGATION_BUTTON_ATTRIBUTE}]:hover`)
            )
                event.preventDefault();
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

/**
 * Whether Shift is held now, as Play would read it (`useHeldNavigationMode`'s rules: only a change
 * re-renders, losing focus lets go, a pointer event re-reads it)
 */
function useHeldShift(enabled: boolean): boolean {
    const [held, setHeld] = useState(false);
    useEffect(() => {
        if (!enabled) return;
        const read = (event: KeyboardEvent | PointerEvent) =>
            setHeld(event.shiftKey && !event.ctrlKey && !event.metaKey);
        const onBlur = () => setHeld(false);
        window.addEventListener("keydown", read, true);
        window.addEventListener("keyup", read, true);
        window.addEventListener("pointermove", read, true);
        window.addEventListener("pointerdown", read, true);
        window.addEventListener("blur", onBlur);
        return () => {
            window.removeEventListener("keydown", read, true);
            window.removeEventListener("keyup", read, true);
            window.removeEventListener("pointermove", read, true);
            window.removeEventListener("pointerdown", read, true);
            window.removeEventListener("blur", onBlur);
            setHeld(false);
        };
    }, [enabled]);
    return held;
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
    readonly label: string;
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
                    <span className="text-[12px]">{row.label}</span>
                    <Keycaps shortcut={row.shortcut} plus />
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

/** What Play (Space) and Shift+Play (Shift+Space) do, in the order the tooltip lists them */
const playGuide = (
    loops: boolean,
): readonly TransportGuideRow<"play" | "shift">[] => [
    {
        mode: "play",
        icon: PLAY_ICON,
        label: loops ? "Play the loop" : "Play from the start flag",
        shortcut: TRANSPORT_SHORTCUTS.play,
    },
    {
        mode: "shift",
        icon: PLAY_FROM_PLAYHEAD_ICON,
        label: loops ? "Play the loop once" : "Play from the playhead",
        shortcut: TRANSPORT_SHORTCUTS.playPage,
    },
];

/** What Stop (Space) and Pause (Shift+Space) do while playing (UI-24) */
const stopGuide: readonly TransportGuideRow<"play" | "shift">[] = [
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
    testIdPrefix = "timeline",
}: {
    isPlaying: boolean;
    onPlayingChange?: (isPlaying: boolean) => void;
    playLoops: boolean;
    onPlayFromPlayhead?: () => void;
    /** "timeline" in the editor, "view3d" in the 3D View window */
    testIdPrefix?: string;
}) {
    const shift = useHeldShift(onPlayingChange != null);
    const togglePlaying = useCallback(
        (event: ReactMouseEvent) =>
            event.shiftKey && onPlayFromPlayhead
                ? onPlayFromPlayhead()
                : onPlayingChange?.(!isPlaying),
        [isPlaying, onPlayingChange, onPlayFromPlayhead],
    );
    const onClick = onPlayingChange ? togglePlaying : undefined;
    const mode = shift && onPlayFromPlayhead ? "shift" : "play";
    const guide = isPlaying ? stopGuide : playGuide(playLoops);
    const row = guide.find((r) => r.mode === mode)!;
    return (
        <TransportButton
            label={row.label}
            keyShortcut={row.shortcut}
            hideLabel
            hint={
                <TransportGuide
                    rows={onPlayFromPlayhead ? guide : guide.slice(0, 1)}
                    mode={mode}
                    testId={`${testIdPrefix}-${isPlaying ? "stop" : "play"}-guide`}
                />
            }
            testId={`${testIdPrefix}-play`}
            pressed={isPlaying}
            onClick={onClick}
        >
            {row.icon}
        </TransportButton>
    );
});
