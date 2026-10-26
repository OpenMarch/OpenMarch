import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from "react";
import clsx from "clsx";
import {
    CaretDownIcon,
    DotsSixVerticalIcon,
    EraserIcon,
    HandIcon,
    LassoIcon,
    MagicWandIcon,
    MagnetIcon,
    PlusCircleIcon,
    QuestionIcon,
    SelectionIcon,
} from "@phosphor-icons/react";
import { LongPressBubble, useLongPress } from "@openmarch/ui";
import { toast } from "sonner";
import type OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import { useIsTouchMode } from "@/stores/InputModeStore";
import {
    TouchModifier,
    useTouchModifierStore,
} from "@/stores/TouchModifierStore";
import { FieldDragMode, useFieldDragModeStore } from "./fieldDragMode";
import { choosePillPosition, PILL_EDGE, Rect } from "./pillPlacement";
import { swallowPress } from "./swallowPress";

export const TOUCH_MODIFIER_POSITION_KEY = "openmarch:touchModifierPosition";
export const TOUCH_MODIFIER_HELP_SEEN_KEY = "openmarch:touchModifierHelpSeen";

/** Held this long with nothing else pressed: explain instead */
const EXPLAIN_MS = 500;

interface Position {
    /** Distance from the left edge of the field (px) */
    left: number;
    /** Distance from the bottom edge of the field (px) */
    bottom: number;
}

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

/** "Apple Pencil" on Apple devices, "a pen" elsewhere */
const PEN =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)
        ? "Apple Pencil"
        : "a pen";

/** What the default does, in plain words */
export const AUTO_DRAG_SENTENCE = `One finger moves the view. ${PEN === "a pen" ? "A pen" : "Pencil"}, or hold then drag, selects.`;

export const DRAG_MODES: Record<
    FieldDragMode,
    { label: string; describe: string; Icon: typeof SelectionIcon }
> = {
    auto: {
        label: "Auto",
        describe: `finger moves, ${PEN === "a pen" ? "pen" : "Pencil"} selects`,
        Icon: MagicWandIcon,
    },
    box: {
        label: "Box",
        describe: "drag a box to select",
        Icon: SelectionIcon,
    },
    lasso: {
        label: "Lasso",
        describe: "draw around to select",
        Icon: LassoIcon,
    },
    pan: {
        label: "Pan",
        describe: "drag moves the view",
        Icon: HandIcon,
    },
};

const EXPLAIN = {
    grip: "Drag to move.",
    drag: "What dragging on empty field does.",
    shift: "Tap marchers to add or remove them.",
    alt: "Move and turn without snapping.",
    help: "Gestures.",
} as const;
type Explained = keyof typeof EXPLAIN;

/**
 * Add (Shift) and No snap (Alt): press-and-hold holds the modifier while
 * another finger works; a press with nothing else pressed latches it on until
 * tapped again, or, held for half a second, explains the button instead.
 */
function useModifierPress(
    modifier: TouchModifier,
    onTap: () => void,
    onExplain: () => void,
) {
    const setHeld = useTouchModifierStore((s) => s.setHeld);
    const toggleLatched = useTouchModifierStore((s) => s.toggleLatched);
    const press = useRef<{
        at: number;
        id: number;
        otherPress: boolean;
        timer: ReturnType<typeof setTimeout> | null;
        stopWatching: () => void;
    } | null>(null);

    const finish = () => {
        const p = press.current;
        press.current = null;
        if (!p) return null;
        if (p.timer !== null) clearTimeout(p.timer);
        p.stopWatching();
        return p;
    };
    useEffect(() => () => void finish(), []);

    const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
        e.preventDefault();
        e.stopPropagation();
        try {
            e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
            // Capture is a nicety
        }
        finish();
        const id = e.pointerId;
        // Another finger pressing meanwhile means the hold is being used
        const watch = (other: PointerEvent) => {
            if (other.pointerId !== id && press.current)
                press.current.otherPress = true;
        };
        window.addEventListener("pointerdown", watch, true);
        const p = {
            // The event's own time: a busy page must not turn a tap into a hold
            at: e.timeStamp > 0 ? e.timeStamp : performance.now(),
            id,
            otherPress: false,
            timer: null as ReturnType<typeof setTimeout> | null,
            stopWatching: () =>
                window.removeEventListener("pointerdown", watch, true),
        };
        if (e.pointerType !== "mouse") {
            p.timer = setTimeout(() => {
                p.timer = null;
                // After any release the browser has queued
                requestAnimationFrame(() => {
                    if (press.current === p && !p.otherPress) onExplain();
                });
            }, EXPLAIN_MS);
        }
        press.current = p;
        setHeld(modifier, true);
    };
    const end = (e: React.PointerEvent<HTMLButtonElement>, tap: boolean) => {
        e.stopPropagation();
        const p = finish();
        if (!p) return;
        setHeld(modifier, false);
        const now = e.timeStamp > 0 ? e.timeStamp : performance.now();
        // Released before the explanation, with no other finger used: a tap
        if (tap && !p.otherPress && now - p.at < EXPLAIN_MS) {
            toggleLatched(modifier);
            onTap();
        }
    };
    return {
        onPointerDown,
        onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => end(e, true),
        onPointerCancel: (e: React.PointerEvent<HTMLButtonElement>) =>
            end(e, false),
        // The finger's release can be swallowed (the pen palm guard takes a
        // finger that was down when the pen landed), but capture still ends:
        // let go of the modifier then, or it stays held
        onLostPointerCapture: (e: React.PointerEvent<HTMLButtonElement>) => {
            if (press.current?.id === e.pointerId) end(e, false);
        },
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

/** The field drawing and the marchers, in the pill container's pixels */
function fieldLayout(
    canvas: OpenMarchCanvas | null,
    container: HTMLElement,
): { field: Rect | null; marchers: { x: number; y: number }[] } {
    const vpt = canvas?.viewportTransform;
    if (!canvas || !vpt) return { field: null, marchers: [] };
    const box = container.getBoundingClientRect();
    const el = (canvas as unknown as { upperCanvasEl: HTMLCanvasElement })
        .upperCanvasEl;
    const canvasBox = el.getBoundingClientRect();
    const dx = canvasBox.left - box.left;
    const dy = canvasBox.top - box.top;
    const zoom = vpt[0];
    const field: Rect = {
        left: dx + vpt[4],
        top: dy + vpt[5],
        width: canvas.fieldProperties.width * zoom,
        height: canvas.fieldProperties.height * zoom,
    };
    const marchers = canvas.getCanvasMarchers().map((m) => {
        const c = m.getAbsoluteCoords();
        return { x: dx + c.x * zoom + vpt[4], y: dy + c.y * zoom + vpt[5] };
    });
    return { field, marchers };
}

/**
 * The floating pill over the field in touch mode, where there is often no
 * keyboard:
 * - "Drag: Box/Lasso/Pan": what a drag from empty field does,
 * - Add (Shift): adds to the selection; No snap (Alt): no snapping,
 * - "?" explains them; the explanation also opens the first time Add or
 *   No snap is tapped. A long press on any of them explains it too.
 *
 * Drag the grip to move it; the spot is remembered. Until then it sits at the
 * bottom where it covers the fewest marchers. While the line tool is active, a
 * "Clear line" button above it stands in for the right-click that clears it.
 */
// eslint-disable-next-line max-lines-per-function
export default function TouchModifierButtons({
    canvas = null,
    showClearLine = false,
    onClearLine,
}: {
    canvas?: OpenMarchCanvas | null;
    showClearLine?: boolean;
    onClearLine?: () => void;
}) {
    const isTouchMode = useIsTouchMode();
    const held = useTouchModifierStore((s) => s.held);
    const latched = useTouchModifierStore((s) => s.latched);
    const clear = useTouchModifierStore((s) => s.clear);
    const dragMode = useFieldDragModeStore((s) => s.mode);
    const setDragMode = useFieldDragModeStore((s) => s.setMode);
    const [saved, setSaved] = useState<Position | null>(() =>
        parseModifierPosition(readStorage(TOUCH_MODIFIER_POSITION_KEY)),
    );
    const [auto, setAuto] = useState<Position | null>(null);
    const [popup, setPopup] = useState<"help" | "mode" | null>(null);
    const [explained, setExplained] = useState<Explained | null>(null);
    const anchors = useRef<Partial<Record<Explained, HTMLElement | null>>>({});
    const rootRef = useRef<HTMLDivElement>(null);
    const pillRef = useRef<HTMLDivElement>(null);
    const drag = useRef<{
        id: number;
        startX: number;
        startY: number;
        from: Position;
    } | null>(null);
    // The first time each is turned on, one line says what it does (the help
    // itself stays closed: it would cover the field the next tap is meant for)
    const noteOnce = useCallback((modifier: TouchModifier) => {
        const key = `${TOUCH_MODIFIER_HELP_SEEN_KEY}:${modifier}`;
        if (readStorage(key)) return;
        writeStorage(key, "1");
        if (!useTouchModifierStore.getState().latched[modifier]) return;
        toast(
            modifier === "shift"
                ? "Add on: tap marchers to add or remove."
                : "No snap on.",
            { duration: 2500 },
        );
    }, []);
    const shift = useModifierPress(
        "shift",
        () => noteOnce("shift"),
        () => setExplained("shift"),
    );
    const alt = useModifierPress(
        "alt",
        () => noteOnce("alt"),
        () => setExplained("alt"),
    );
    const modeLongPress = useLongPress(() => setExplained("drag"));
    const helpLongPress = useLongPress(() => setExplained("help"));
    const closeExplained = useCallback(() => setExplained(null), []);
    const position = saved ?? auto;

    // Leaving touch mode (or the field) lets go of anything held or latched
    useEffect(() => {
        if (!isTouchMode) clear();
    }, [isTouchMode, clear]);
    useEffect(() => () => clear(), [clear]);

    const container = () =>
        (rootRef.current?.offsetParent as HTMLElement | null) ?? null;

    const clamp = useCallback((p: Position): Position => {
        const pill = pillRef.current;
        const parent = rootRef.current?.offsetParent as HTMLElement | null;
        if (!pill || !parent) return p;
        const maxLeft = Math.max(0, parent.clientWidth - pill.offsetWidth);
        const maxBottom = Math.max(0, parent.clientHeight - pill.offsetHeight);
        return {
            left: Math.min(Math.max(0, p.left), maxLeft),
            bottom: Math.min(Math.max(0, p.bottom), maxBottom),
        };
    }, []);

    // No saved spot: the bottom spot that covers the fewest marchers. Worked
    // out again when the field area changes size and when a pan or zoom ends.
    const placeAutomatically = useCallback(() => {
        const pill = pillRef.current;
        const parent = rootRef.current?.offsetParent as HTMLElement | null;
        if (!pill || !parent) return;
        const { field, marchers } = fieldLayout(canvas, parent);
        setAuto(
            choosePillPosition(
                { width: parent.clientWidth, height: parent.clientHeight },
                { width: pill.offsetWidth, height: pill.offsetHeight },
                field,
                marchers,
            ),
        );
    }, [canvas]);
    useLayoutEffect(() => {
        if (!isTouchMode || saved) return;
        placeAutomatically();
        // Again once the field has been fitted and the marchers drawn
        const later = setTimeout(placeAutomatically, 800);
        const parent = container();
        const observer =
            parent && typeof ResizeObserver !== "undefined"
                ? new ResizeObserver(() => placeAutomatically())
                : null;
        if (parent) observer?.observe(parent);
        const onSettled = () => placeAutomatically();
        canvas?.on("view:settled" as any, onSettled);
        return () => {
            clearTimeout(later);
            observer?.disconnect();
            canvas?.off("view:settled" as any, onSettled);
        };
    }, [isTouchMode, saved, placeAutomatically, canvas]);

    // A pop-up closes on a press anywhere else (which does nothing more), or
    // Escape. Registered as the pop-up appears, so no press slips through.
    useLayoutEffect(() => {
        if (!popup && !explained) return;
        const onDown = (e: PointerEvent) => {
            if (rootRef.current?.contains(e.target as Node)) return;
            e.stopPropagation();
            e.preventDefault();
            swallowPress(e.pointerId);
            setPopup(null);
            setExplained(null);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setPopup(null);
        };
        document.addEventListener("pointerdown", onDown, true);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("pointerdown", onDown, true);
            document.removeEventListener("keydown", onKey);
        };
    }, [popup, explained]);

    const onGripDown = (e: React.PointerEvent<HTMLDivElement>) => {
        gripLongPress.onPointerDown(e);
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
            from: position ?? { left: PILL_EDGE, bottom: PILL_EDGE },
        };
    };
    const gripLongPress = useLongPress(() => setExplained("grip"));
    const onGripMove = (e: React.PointerEvent<HTMLDivElement>) => {
        gripLongPress.onPointerMove(e);
        const d = drag.current;
        if (!d || d.id !== e.pointerId) return;
        e.stopPropagation();
        setSaved(
            clamp({
                left: d.from.left + (e.clientX - d.startX),
                bottom: d.from.bottom - (e.clientY - d.startY),
            }),
        );
    };
    const onGripUp = (e: React.PointerEvent<HTMLDivElement>) => {
        gripLongPress.onPointerUp(e);
        const d = drag.current;
        if (!d || d.id !== e.pointerId) return;
        e.stopPropagation();
        drag.current = null;
        setSaved((p) => {
            if (p) writeStorage(TOUCH_MODIFIER_POSITION_KEY, JSON.stringify(p));
            return p;
        });
    };

    if (!isTouchMode) return null;

    const shiftOn = held.shift || latched.shift;
    const altOn = held.alt || latched.alt;
    const segment = (on: boolean) =>
        clsx(
            "flex h-44 min-w-48 touch-none items-center justify-center gap-4 rounded-full px-8 text-sm font-medium whitespace-nowrap select-none",
            on ? "bg-accent text-text-invert" : "text-text",
        );
    const mode = DRAG_MODES[dragMode];

    // Pop-ups open toward the middle of the field, on the side with room,
    // and scroll rather than run off the field
    const parent = container();
    const pillWidth = pillRef.current?.offsetWidth ?? 0;
    const pillHeight = pillRef.current?.offsetHeight ?? 48;
    const containerHeight = parent?.clientHeight ?? 0;
    const onRight =
        position && parent
            ? position.left + pillWidth / 2 > parent.clientWidth / 2
            : true;
    const roomAbove = position
        ? containerHeight - position.bottom - pillHeight - 16
        : 300;
    const roomBelow = position ? position.bottom - 16 : 0;
    const openBelow = roomAbove < 200 && roomBelow > roomAbove;
    const popupStyle: React.CSSProperties = {
        maxHeight: Math.max(120, openBelow ? roomBelow : roomAbove),
    };
    const popupSide = clsx(
        "absolute overflow-y-auto",
        onRight ? "right-0" : "left-0",
        openBelow ? "top-[calc(100%+8px)]" : "bottom-[calc(100%+8px)]",
    );
    const setAnchor = (key: Explained) => (el: HTMLElement | null) => {
        anchors.current[key] = el;
    };

    return (
        <div
            ref={rootRef}
            className="pointer-events-auto absolute z-20"
            style={
                position
                    ? { left: position.left, bottom: position.bottom }
                    : {
                          right: PILL_EDGE,
                          bottom: PILL_EDGE,
                          visibility: "hidden",
                      }
            }
            data-testid="touch-modifier-buttons"
        >
            {popup === "help" && (
                <div
                    role="note"
                    style={popupStyle}
                    className={clsx(
                        popupSide,
                        "border-stroke bg-bg-1 text-text w-[240px] max-w-[calc(100vw-24px)] rounded-lg border p-12 text-sm leading-snug shadow-lg",
                    )}
                    onClick={() => setPopup(null)}
                >
                    <ul className="flex flex-col gap-4">
                        <li>
                            <b>1 finger</b> moves · <b>2</b> zoom
                        </li>
                        <li>
                            <b>{PEN === "a pen" ? "Pen" : "Pencil"}</b> or{" "}
                            <b>hold + drag</b> selects
                        </li>
                        <li>
                            <b>Hold a marcher</b> adds it
                        </li>
                        <li>
                            <b>2-finger tap</b> undo · <b>3</b> redo
                        </li>
                        <li>
                            <b>Add</b> taps to add · <b>No snap</b> moves freely
                        </li>
                    </ul>
                </div>
            )}
            {popup === "mode" && (
                <div
                    role="menu"
                    aria-label="Drag from empty field"
                    style={popupStyle}
                    className={clsx(
                        popupSide,
                        "border-stroke bg-bg-1 text-text flex w-[240px] flex-col rounded-lg border p-4 shadow-lg",
                    )}
                >
                    {(Object.keys(DRAG_MODES) as FieldDragMode[]).map((key) => {
                        const option = DRAG_MODES[key];
                        return (
                            <button
                                key={key}
                                type="button"
                                role="menuitemradio"
                                aria-checked={key === dragMode}
                                className={clsx(
                                    "flex min-h-44 items-center gap-8 rounded-md px-8 text-left text-sm",
                                    key === dragMode && "bg-accent/15",
                                )}
                                onClick={() => {
                                    setDragMode(key);
                                    setPopup(null);
                                }}
                            >
                                <option.Icon size={18} />
                                <span>
                                    <b>{option.label}</b>
                                    <span className="text-text-subtitle block text-xs">
                                        {option.describe}
                                    </span>
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}
            {showClearLine && !popup && (
                <button
                    type="button"
                    className={clsx(
                        popupSide,
                        "border-stroke bg-bg-1 text-text flex h-44 items-center gap-6 rounded-full border px-14 text-sm font-medium whitespace-nowrap shadow-lg",
                    )}
                    onClick={onClearLine}
                >
                    <EraserIcon size={18} />
                    Clear line
                </button>
            )}
            <div className="flex items-center gap-6">
                <div
                    ref={pillRef}
                    // These explain themselves on a long press (not the app-wide guard)
                    data-own-long-press
                    className="border-stroke bg-bg-1 flex items-center rounded-full border p-2 shadow-lg"
                >
                    <div
                        ref={setAnchor("grip")}
                        role="button"
                        aria-label="Move these buttons"
                        title="Drag to move"
                        tabIndex={-1}
                        className="text-text-subtitle flex h-44 w-44 cursor-grab touch-none items-center justify-center rounded-full"
                        onPointerDown={onGripDown}
                        onPointerMove={onGripMove}
                        onPointerUp={onGripUp}
                        onPointerCancel={onGripUp}
                        onContextMenu={(e) => e.preventDefault()}
                    >
                        <DotsSixVerticalIcon size={20} />
                    </div>
                    <button
                        ref={setAnchor("drag")}
                        type="button"
                        aria-haspopup="menu"
                        aria-expanded={popup === "mode"}
                        aria-label={`Drag from empty field: ${mode.label}, ${mode.describe}. Tap to change`}
                        className="border-stroke text-text flex h-36 items-center gap-4 rounded-full border px-8 text-sm whitespace-nowrap select-none"
                        data-testid="field-drag-mode"
                        {...modeLongPress}
                        onClick={() =>
                            setPopup((open) =>
                                open === "mode" ? null : "mode",
                            )
                        }
                    >
                        <span className="text-text-subtitle text-xs">
                            Drag:
                        </span>
                        <mode.Icon size={16} />
                        <span className="font-medium">{mode.label}</span>
                        <CaretDownIcon size={12} />
                    </button>
                    <button
                        ref={setAnchor("shift")}
                        type="button"
                        aria-label={
                            latched.shift
                                ? "Add, on. Tap to turn off"
                                : "Add: hold, or tap to keep on. Tapping marchers adds them to the selection"
                        }
                        aria-pressed={shiftOn}
                        className={segment(shiftOn)}
                        {...shift}
                    >
                        <PlusCircleIcon
                            size={16}
                            weight={shiftOn ? "fill" : "regular"}
                        />
                        Add
                    </button>
                    <button
                        ref={setAnchor("alt")}
                        type="button"
                        aria-label={
                            latched.alt
                                ? "No snap, on. Tap to turn off"
                                : "No snap: hold, or tap to keep on. Moving and turning don't snap to steps"
                        }
                        aria-pressed={altOn}
                        className={segment(altOn)}
                        {...alt}
                    >
                        <MagnetIcon
                            size={16}
                            weight={altOn ? "fill" : "regular"}
                        />
                        No snap
                    </button>
                    <button
                        ref={setAnchor("help")}
                        type="button"
                        aria-label="What these buttons do"
                        aria-expanded={popup === "help"}
                        className="text-text-subtitle flex h-44 w-44 items-center justify-center rounded-full"
                        {...helpLongPress}
                        onClick={() => {
                            writeStorage(TOUCH_MODIFIER_HELP_SEEN_KEY, "1");
                            setPopup((open) =>
                                open === "help" ? null : "help",
                            );
                        }}
                    >
                        <QuestionIcon size={20} />
                    </button>
                </div>
            </div>
            <LongPressBubble
                anchor={explained ? (anchors.current[explained] ?? null) : null}
                open={explained !== null}
                onClose={closeExplained}
            >
                {explained ? EXPLAIN[explained] : ""}
            </LongPressBubble>
        </div>
    );
}
