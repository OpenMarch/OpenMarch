import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from "react";
import clsx from "clsx";
import {
    ArrowFatUpIcon,
    DotsSixVerticalIcon,
    EraserIcon,
    MagnetIcon,
    QuestionIcon,
} from "@phosphor-icons/react";
import { useIsTouchMode } from "@/stores/InputModeStore";
import {
    TouchModifier,
    useTouchModifierStore,
} from "@/stores/TouchModifierStore";

export const TOUCH_MODIFIER_POSITION_KEY = "openmarch:touchModifierPosition";
export const TOUCH_MODIFIER_HELP_SEEN_KEY = "openmarch:touchModifierHelpSeen";

/** A press shorter than this is a tap (latch); longer is a hold */
const TAP_MS = 250;

interface Position {
    /** Distance from the left edge of the field (px) */
    left: number;
    /** Distance from the bottom edge of the field (px) */
    bottom: number;
}

/** Clear of the zoom buttons, which sit in the bottom-right corner */
const DEFAULT_BOTTOM = 76;
const EDGE = 12;

export const parseModifierPosition = (raw: string | null): Position | null => {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as Partial<Position>;
        if (
            typeof parsed.left === "number" &&
            typeof parsed.bottom === "number" &&
            Number.isFinite(parsed.left) &&
            Number.isFinite(parsed.bottom)
        ) {
            return { left: parsed.left, bottom: parsed.bottom };
        }
    } catch {
        // Fall through to the default
    }
    return null;
};

const readStorage = (key: string): string | null => {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
};
const writeStorage = (key: string, value: string) => {
    try {
        localStorage.setItem(key, value);
    } catch {
        // Storage may be unavailable; keep it for this session
    }
};

/**
 * Press-and-hold holds the modifier; a quick tap latches it on until tapped
 * again.
 */
function useModifierPress(modifier: TouchModifier, onTap: () => void) {
    const setHeld = useTouchModifierStore((s) => s.setHeld);
    const toggleLatched = useTouchModifierStore((s) => s.toggleLatched);
    const downAt = useRef<number | null>(null);

    const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
        e.preventDefault();
        e.stopPropagation();
        try {
            e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
            // Capture is a nicety
        }
        downAt.current = performance.now();
        setHeld(modifier, true);
    };
    const end = (e: React.PointerEvent<HTMLButtonElement>, tap: boolean) => {
        e.stopPropagation();
        if (downAt.current === null) return;
        const quick = performance.now() - downAt.current < TAP_MS;
        downAt.current = null;
        setHeld(modifier, false);
        if (tap && quick) {
            toggleLatched(modifier);
            onTap();
        }
    };
    return {
        onPointerDown,
        onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => end(e, true),
        onPointerCancel: (e: React.PointerEvent<HTMLButtonElement>) =>
            end(e, false),
        // Keyboard and assistive tech: a click latches
        onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggleLatched(modifier);
            }
        },
        onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    };
}

/**
 * On-screen Shift and Alt for the field in touch mode, where there is often no
 * keyboard, as one small pill: Shift adds to the selection (and, as on a
 * keyboard, moves without snapping), Alt moves without snapping to steps.
 * "?" explains them; the explanation also opens the first time either is
 * tapped. Drag the grip to move the pill; the spot is remembered.
 *
 * While the line tool is active, a "Clear line" button stands in for the
 * right-click that clears the line with a mouse.
 */
// eslint-disable-next-line max-lines-per-function
export default function TouchModifierButtons({
    showClearLine = false,
    onClearLine,
}: {
    showClearLine?: boolean;
    onClearLine?: () => void;
}) {
    const isTouchMode = useIsTouchMode();
    const held = useTouchModifierStore((s) => s.held);
    const latched = useTouchModifierStore((s) => s.latched);
    const clear = useTouchModifierStore((s) => s.clear);
    const [position, setPosition] = useState<Position | null>(() =>
        parseModifierPosition(readStorage(TOUCH_MODIFIER_POSITION_KEY)),
    );
    const [helpOpen, setHelpOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const drag = useRef<{
        id: number;
        startX: number;
        startY: number;
        from: Position;
    } | null>(null);
    const showHelpOnce = useCallback(() => {
        if (readStorage(TOUCH_MODIFIER_HELP_SEEN_KEY)) return;
        writeStorage(TOUCH_MODIFIER_HELP_SEEN_KEY, "1");
        setHelpOpen(true);
    }, []);
    const shift = useModifierPress("shift", showHelpOnce);
    const alt = useModifierPress("alt", showHelpOnce);

    // Leaving touch mode (or the field) lets go of anything held or latched
    useEffect(() => {
        if (!isTouchMode) clear();
    }, [isTouchMode, clear]);
    useEffect(() => () => clear(), [clear]);

    const clamp = useCallback((p: Position): Position => {
        const root = rootRef.current;
        const parent = root?.offsetParent as HTMLElement | null;
        if (!root || !parent) return p;
        const maxLeft = Math.max(0, parent.clientWidth - root.offsetWidth);
        const maxBottom = Math.max(0, parent.clientHeight - root.offsetHeight);
        return {
            left: Math.min(Math.max(0, p.left), maxLeft),
            bottom: Math.min(Math.max(0, p.bottom), maxBottom),
        };
    }, []);

    // No saved spot: bottom-right, above the zoom buttons, away from the field's corner
    useLayoutEffect(() => {
        if (!isTouchMode || position) return;
        const root = rootRef.current;
        const parent = root?.offsetParent as HTMLElement | null;
        if (!root || !parent) return;
        setPosition(
            clamp({
                left: parent.clientWidth - root.offsetWidth - EDGE,
                bottom: DEFAULT_BOTTOM,
            }),
        );
    }, [isTouchMode, position, clamp]);

    const onGripDown = (e: React.PointerEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        try {
            e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
            // Capture is a nicety
        }
        drag.current = {
            id: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            from: position ?? { left: EDGE, bottom: DEFAULT_BOTTOM },
        };
    };
    const onGripMove = (e: React.PointerEvent<HTMLDivElement>) => {
        const d = drag.current;
        if (!d || d.id !== e.pointerId) return;
        e.stopPropagation();
        setPosition(
            clamp({
                left: d.from.left + (e.clientX - d.startX),
                bottom: d.from.bottom - (e.clientY - d.startY),
            }),
        );
    };
    const onGripUp = (e: React.PointerEvent<HTMLDivElement>) => {
        const d = drag.current;
        if (!d || d.id !== e.pointerId) return;
        e.stopPropagation();
        drag.current = null;
        setPosition((p) => {
            if (p) writeStorage(TOUCH_MODIFIER_POSITION_KEY, JSON.stringify(p));
            return p;
        });
    };

    if (!isTouchMode) return null;

    const shiftOn = held.shift || latched.shift;
    const altOn = held.alt || latched.alt;
    const segment = (on: boolean) =>
        clsx(
            "flex h-44 min-w-56 touch-none items-center justify-center gap-4 rounded-full px-10 text-sm font-medium select-none",
            on ? "bg-accent text-text-invert" : "text-text",
        );

    return (
        <div
            ref={rootRef}
            className="pointer-events-auto absolute z-20 flex flex-col items-end gap-6"
            style={
                position
                    ? { left: position.left, bottom: position.bottom }
                    : {
                          right: EDGE,
                          bottom: DEFAULT_BOTTOM,
                          visibility: "hidden",
                      }
            }
            data-testid="touch-modifier-buttons"
            // The Shift/Alt buttons are held on purpose: keep the app's long-press hint off them
            data-own-long-press
        >
            {helpOpen && (
                <div
                    role="note"
                    className="border-stroke bg-bg-1 text-text w-[260px] rounded-lg border p-12 text-sm leading-snug shadow-lg"
                    onClick={() => setHelpOpen(false)}
                >
                    <p>
                        <b>Shift</b>: hold it, or tap to keep it on. While it is
                        on, tapping a marcher adds it to the selection or takes
                        it out, and drags don&apos;t snap to steps.
                    </p>
                    <p className="mt-6">
                        <b>Alt</b>: drags don&apos;t snap to steps.
                    </p>
                    <p className="text-text-subtitle mt-6">
                        Without them: long press a marcher to add it. Two-finger
                        tap undoes, three-finger tap redoes. Tap to close.
                    </p>
                </div>
            )}
            <div className="flex items-center gap-6">
                {showClearLine && (
                    <button
                        type="button"
                        className="border-stroke bg-bg-1 text-text flex h-44 items-center gap-6 rounded-full border px-14 text-sm font-medium shadow-lg"
                        onClick={onClearLine}
                    >
                        <EraserIcon size={18} />
                        Clear line
                    </button>
                )}
                <div className="border-stroke bg-bg-1 flex items-center rounded-full border p-2 shadow-lg">
                    <div
                        role="button"
                        aria-label="Move the Shift and Alt buttons"
                        title="Drag to move"
                        tabIndex={-1}
                        className="text-text-subtitle flex h-44 w-44 cursor-grab touch-none items-center justify-center rounded-full"
                        onPointerDown={onGripDown}
                        onPointerMove={onGripMove}
                        onPointerUp={onGripUp}
                        onPointerCancel={onGripUp}
                    >
                        <DotsSixVerticalIcon size={20} />
                    </div>
                    <button
                        type="button"
                        aria-label={
                            latched.shift
                                ? "Shift, on. Tap to turn off"
                                : "Shift: hold, or tap to keep on. Tapping marchers adds them to the selection"
                        }
                        aria-pressed={shiftOn}
                        className={segment(shiftOn)}
                        {...shift}
                    >
                        <ArrowFatUpIcon
                            size={16}
                            weight={shiftOn ? "fill" : "regular"}
                        />
                        {latched.shift ? "Shift on" : "Shift"}
                    </button>
                    <button
                        type="button"
                        aria-label={
                            latched.alt
                                ? "Alt, no snapping, on. Tap to turn off"
                                : "Alt: hold, or tap to keep on. Drags don't snap to steps"
                        }
                        aria-pressed={altOn}
                        className={segment(altOn)}
                        {...alt}
                    >
                        <MagnetIcon
                            size={16}
                            weight={altOn ? "fill" : "regular"}
                        />
                        {latched.alt ? "Alt on" : "Alt"}
                    </button>
                    <button
                        type="button"
                        aria-label="What Shift and Alt do"
                        aria-expanded={helpOpen}
                        className="text-text-subtitle flex h-44 w-40 items-center justify-center rounded-full"
                        onClick={() => {
                            writeStorage(TOUCH_MODIFIER_HELP_SEEN_KEY, "1");
                            setHelpOpen((open) => !open);
                        }}
                    >
                        <QuestionIcon size={18} />
                    </button>
                </div>
            </div>
        </div>
    );
}
