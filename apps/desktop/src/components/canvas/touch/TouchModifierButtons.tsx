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
    HandIcon,
    LassoIcon,
    MagnetIcon,
    QuestionIcon,
    SelectionIcon,
} from "@phosphor-icons/react";
import type OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import { useIsTouchMode } from "@/stores/InputModeStore";
import {
    TouchModifier,
    useTouchModifierStore,
} from "@/stores/TouchModifierStore";
import {
    FieldDragMode,
    nextFieldDragMode,
    useFieldDragModeStore,
} from "./fieldDragMode";
import { choosePillPosition, PILL_EDGE, Rect } from "./pillPlacement";

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

const DRAG_MODE_LABELS: Record<
    FieldDragMode,
    { label: string; describe: string; Icon: typeof SelectionIcon }
> = {
    box: {
        label: "Box",
        describe: "draws a selection box",
        Icon: SelectionIcon,
    },
    lasso: { label: "Lasso", describe: "draws a lasso", Icon: LassoIcon },
    pan: { label: "Pan", describe: "moves the view", Icon: HandIcon },
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
 * - what a drag from empty field does (box, lasso or pan; tap to change),
 * - Shift: adds to the selection (and, as on a keyboard, moves without
 *   snapping), Alt: moves and turns without snapping,
 * - "?" explains them; the explanation also opens the first time Shift or
 *   Alt is tapped.
 *
 * Drag the grip to move it; the spot is remembered. Until then it sits where
 * it covers the fewest marchers. While the line tool is active, a "Clear
 * line" button above it stands in for the right-click that clears the line.
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
    const [helpOpen, setHelpOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const pillRef = useRef<HTMLDivElement>(null);
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

    // No saved spot: the candidate that covers the fewest marchers. Worked out
    // again when the field area changes size (not on every pan or zoom).
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
        return () => {
            clearTimeout(later);
            observer?.disconnect();
        };
    }, [isTouchMode, saved, placeAutomatically]);

    // The explanation closes on a tap anywhere else, or Escape
    useEffect(() => {
        if (!helpOpen) return;
        const onDown = (e: PointerEvent) => {
            if (rootRef.current?.contains(e.target as Node)) return;
            setHelpOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setHelpOpen(false);
        };
        document.addEventListener("pointerdown", onDown, true);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("pointerdown", onDown, true);
            document.removeEventListener("keydown", onKey);
        };
    }, [helpOpen]);

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
            from: position ?? { left: PILL_EDGE, bottom: PILL_EDGE },
        };
    };
    const onGripMove = (e: React.PointerEvent<HTMLDivElement>) => {
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
            "flex h-44 min-w-48 touch-none items-center justify-center gap-4 rounded-full px-8 text-sm font-medium select-none",
            on ? "bg-accent text-text-invert" : "text-text",
        );
    const mode = DRAG_MODE_LABELS[dragMode];

    // Pop-ups open toward the middle of the field, so they are never cut off
    const parent = container();
    const pillWidth = pillRef.current?.offsetWidth ?? 0;
    const onRight =
        position && parent
            ? position.left + pillWidth / 2 > parent.clientWidth / 2
            : true;
    const nearTop =
        position && parent ? position.bottom > parent.clientHeight / 2 : false;
    const popupSide = clsx(
        "absolute",
        onRight ? "right-0" : "left-0",
        nearTop ? "top-[calc(100%+8px)]" : "bottom-[calc(100%+8px)]",
    );

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
            // The Shift/Alt buttons are held on purpose: keep the app's long-press hint off them
            data-own-long-press
        >
            {(showClearLine || helpOpen) && (
                <div
                    className={clsx(
                        popupSide,
                        "flex flex-col gap-6",
                        onRight ? "items-end" : "items-start",
                        nearTop && "flex-col-reverse",
                    )}
                >
                    {helpOpen && (
                        <div
                            role="note"
                            className="border-stroke bg-bg-1 text-text w-[260px] max-w-[calc(100vw-24px)] rounded-lg border p-12 text-sm leading-snug shadow-lg"
                            onClick={() => setHelpOpen(false)}
                        >
                            <p>
                                <b>Box / Lasso / Pan</b>: what dragging one
                                finger or the pen from empty field does. Two
                                fingers always move the view.
                            </p>
                            <p className="mt-6">
                                <b>Shift</b>: hold it, or tap to keep it on.
                                While it is on, tapping a marcher adds it to the
                                selection or takes it out, and drags don&apos;t
                                snap to steps.
                            </p>
                            <p className="mt-6">
                                <b>Alt</b>: moving and turning don&apos;t snap.
                            </p>
                            <p className="text-text-subtitle mt-6">
                                Long press a marcher to add it. Two-finger tap
                                undoes, three-finger tap redoes.
                            </p>
                        </div>
                    )}
                    {showClearLine && (
                        <button
                            type="button"
                            className="border-stroke bg-bg-1 text-text flex h-44 items-center gap-6 rounded-full border px-14 text-sm font-medium whitespace-nowrap shadow-lg"
                            onClick={onClearLine}
                        >
                            <EraserIcon size={18} />
                            Clear line
                        </button>
                    )}
                </div>
            )}
            <div
                ref={pillRef}
                className="border-stroke bg-bg-1 flex items-center rounded-full border p-2 shadow-lg"
            >
                <div
                    role="button"
                    aria-label="Move these buttons"
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
                    aria-label={`Dragging from empty field ${mode.describe}. Tap to change`}
                    title={`Drag from empty field: ${mode.label}`}
                    className={segment(false)}
                    data-testid="field-drag-mode"
                    onClick={() => setDragMode(nextFieldDragMode(dragMode))}
                >
                    <mode.Icon size={16} />
                    {mode.label}
                </button>
                <span className="bg-stroke mx-2 h-24 w-1" aria-hidden />
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
                            : "Alt: hold, or tap to keep on. Moving and turning don't snap"
                    }
                    aria-pressed={altOn}
                    className={segment(altOn)}
                    {...alt}
                >
                    <MagnetIcon size={16} weight={altOn ? "fill" : "regular"} />
                    {latched.alt ? "Alt on" : "Alt"}
                </button>
                <button
                    type="button"
                    aria-label="What these buttons do"
                    aria-expanded={helpOpen}
                    className="text-text-subtitle flex h-44 w-44 items-center justify-center rounded-full"
                    onClick={() => {
                        writeStorage(TOUCH_MODIFIER_HELP_SEEN_KEY, "1");
                        setHelpOpen((open) => !open);
                    }}
                >
                    <QuestionIcon size={20} />
                </button>
            </div>
        </div>
    );
}
