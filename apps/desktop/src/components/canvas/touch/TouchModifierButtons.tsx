import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import {
    ArrowFatUpIcon,
    DotsSixVerticalIcon,
    EraserIcon,
    MagnetIcon,
} from "@phosphor-icons/react";
import { useIsTouchMode } from "@/stores/InputModeStore";
import {
    TouchModifier,
    useTouchModifierStore,
} from "@/stores/TouchModifierStore";

export const TOUCH_MODIFIER_POSITION_KEY = "openmarch:touchModifierPosition";

/** A press shorter than this is a tap (latch); longer is a hold */
const TAP_MS = 250;

interface Position {
    /** Distance from the left edge of the field (px) */
    left: number;
    /** Distance from the bottom edge of the field (px) */
    bottom: number;
}

const DEFAULT_POSITION: Position = { left: 12, bottom: 72 };

export const parseModifierPosition = (raw: string | null): Position => {
    if (!raw) return DEFAULT_POSITION;
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
    return DEFAULT_POSITION;
};

const loadPosition = (): Position => {
    try {
        return parseModifierPosition(
            localStorage.getItem(TOUCH_MODIFIER_POSITION_KEY),
        );
    } catch {
        return DEFAULT_POSITION;
    }
};

/**
 * Press-and-hold holds the modifier; a quick tap latches it on until tapped
 * again.
 */
function useModifierPress(modifier: TouchModifier) {
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
        if (tap && quick) toggleLatched(modifier);
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
 * keyboard: Shift adds to the selection (and, as on a keyboard, moves without
 * snapping), Alt moves without snapping to steps. Drag the grip to move them;
 * the spot is remembered.
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
    const [position, setPosition] = useState<Position>(loadPosition);
    const rootRef = useRef<HTMLDivElement>(null);
    const drag = useRef<{
        id: number;
        startX: number;
        startY: number;
        from: Position;
    } | null>(null);
    const shift = useModifierPress("shift");
    const alt = useModifierPress("alt");

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
            from: position,
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
            try {
                localStorage.setItem(
                    TOUCH_MODIFIER_POSITION_KEY,
                    JSON.stringify(p),
                );
            } catch {
                // Storage may be unavailable; keep it for this session
            }
            return p;
        });
    };

    if (!isTouchMode) return null;

    const shiftOn = held.shift || latched.shift;
    const altOn = held.alt || latched.alt;
    const buttonClass = (on: boolean) =>
        clsx(
            "border-stroke flex flex-col items-center justify-center rounded-full border font-medium shadow-lg select-none",
            on
                ? "bg-accent text-text-invert border-accent"
                : "bg-bg-1 text-text",
        );

    return (
        <div
            ref={rootRef}
            className="pointer-events-auto absolute z-20 flex items-end gap-6"
            style={{ left: position.left, bottom: position.bottom }}
            data-testid="touch-modifier-buttons"
        >
            <div
                role="button"
                aria-label="Move the Shift and Alt buttons"
                title="Drag to move"
                tabIndex={-1}
                className="text-text-subtitle bg-bg-1/80 border-stroke flex h-48 w-24 cursor-grab touch-none items-center justify-center rounded-full border"
                onPointerDown={onGripDown}
                onPointerMove={onGripMove}
                onPointerUp={onGripUp}
                onPointerCancel={onGripUp}
            >
                <DotsSixVerticalIcon size={18} />
            </div>
            <button
                type="button"
                aria-label={
                    latched.shift
                        ? "Shift, on. Tap to turn off"
                        : "Shift: hold, or tap to keep on. Adds to the selection"
                }
                aria-pressed={shiftOn}
                title="Shift: hold, or tap to keep on. Adds to the selection."
                className={clsx(buttonClass(shiftOn), "h-56 w-56 touch-none")}
                {...shift}
            >
                <ArrowFatUpIcon
                    size={20}
                    weight={shiftOn ? "fill" : "regular"}
                />
                <span className="text-[11px] leading-none">
                    {latched.shift ? "Shift on" : "Shift"}
                </span>
            </button>
            <button
                type="button"
                aria-label={
                    latched.alt
                        ? "Alt, no snapping, on. Tap to turn off"
                        : "Alt: hold, or tap to keep on. Moves without snapping to steps"
                }
                aria-pressed={altOn}
                title="Alt: hold, or tap to keep on. Moves without snapping to steps."
                className={clsx(buttonClass(altOn), "h-48 w-48 touch-none")}
                {...alt}
            >
                <MagnetIcon size={16} weight={altOn ? "fill" : "regular"} />
                <span className="text-[10px] leading-none">
                    {latched.alt ? "Alt on" : "Alt"}
                </span>
            </button>
            {showClearLine && (
                <button
                    type="button"
                    className="border-stroke bg-bg-1 text-text flex h-48 items-center gap-6 rounded-full border px-16 text-sm font-medium shadow-lg"
                    onClick={onClearLine}
                >
                    <EraserIcon size={18} />
                    Clear line
                </button>
            )}
        </div>
    );
}
