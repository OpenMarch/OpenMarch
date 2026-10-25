import React, {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from "react";
import { createPortal } from "react-dom";
import { clsx } from "clsx";

/** How long a finger or pen has to stay down before it counts as a long press. */
export const LONG_PRESS_MS = 500;
/** How far it may wander (CSS px) and still be a press rather than a drag. */
const LONG_PRESS_SLOP = 10;

export type LongPressHandlers = {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
    onClickCapture: (e: React.MouseEvent) => void;
    onContextMenu: (e: React.MouseEvent) => void;
};

/**
 * A long press with a finger or pen (never a mouse) calls `onLongPress` and
 * swallows the click that follows, so the button's own action doesn't run.
 * Spread the returned handlers on the element; they call any handlers you pass
 * in `chain` first.
 */
export function useLongPress(
    onLongPress: () => void,
    chain: Partial<Record<keyof LongPressHandlers, (e: never) => void>> = {},
    delay = LONG_PRESS_MS,
): LongPressHandlers {
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const start = useRef<{ x: number; y: number } | null>(null);
    const fired = useRef(false);
    const callback = useRef(onLongPress);
    callback.current = onLongPress;

    const clear = useCallback(() => {
        if (timer.current !== null) clearTimeout(timer.current);
        timer.current = null;
        start.current = null;
    }, []);
    useEffect(() => clear, [clear]);

    const call = (name: keyof LongPressHandlers, e: unknown) =>
        (chain[name] as ((e: unknown) => void) | undefined)?.(e);

    return {
        onPointerDown: (e) => {
            call("onPointerDown", e);
            fired.current = false;
            clear();
            if (
                (e.pointerType !== "touch" && e.pointerType !== "pen") ||
                e.button > 0
            )
                return;
            start.current = { x: e.clientX, y: e.clientY };
            timer.current = setTimeout(() => {
                timer.current = null;
                fired.current = true;
                callback.current();
            }, delay);
        },
        onPointerMove: (e) => {
            call("onPointerMove", e);
            const s = start.current;
            if (
                s &&
                Math.hypot(e.clientX - s.x, e.clientY - s.y) > LONG_PRESS_SLOP
            )
                clear();
        },
        onPointerUp: (e) => {
            call("onPointerUp", e);
            clear();
        },
        onPointerCancel: (e) => {
            call("onPointerCancel", e);
            clear();
        },
        onClickCapture: (e) => {
            if (fired.current) {
                fired.current = false;
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            call("onClickCapture", e);
        },
        onContextMenu: (e) => {
            // Android raises a context menu on a long press; the hint replaces it
            if (fired.current || timer.current !== null) e.preventDefault();
            call("onContextMenu", e);
        },
    };
}

/**
 * A small explanation bubble next to `anchor`, for a long press on a button.
 * Closes on the next press anywhere, on Escape and on scroll.
 */
export function LongPressBubble({
    anchor,
    open,
    onClose,
    children,
    className,
}: {
    anchor: HTMLElement | null;
    open: boolean;
    onClose: () => void;
    children: React.ReactNode;
    className?: string;
}) {
    const bubbleRef = useRef<HTMLDivElement>(null);
    const [style, setStyle] = useState<React.CSSProperties>({
        position: "fixed",
        visibility: "hidden",
    });

    useLayoutEffect(() => {
        if (!open || !anchor) return;
        const rect = anchor.getBoundingClientRect();
        const bubble = bubbleRef.current?.getBoundingClientRect();
        const width = bubble?.width ?? 0;
        const height = bubble?.height ?? 0;
        const margin = 8;
        const left = Math.min(
            Math.max(margin, rect.left + rect.width / 2 - width / 2),
            window.innerWidth - width - margin,
        );
        const below = rect.bottom + margin;
        const top =
            below + height > window.innerHeight - margin
                ? Math.max(margin, rect.top - margin - height)
                : below;
        setStyle({ position: "fixed", left, top });
    }, [open, anchor]);

    useEffect(() => {
        if (!open) return;
        const close = () => onClose();
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        // Added after the press that opened it has finished
        const id = setTimeout(() => {
            window.addEventListener("pointerdown", close, true);
            window.addEventListener("scroll", close, true);
            window.addEventListener("keydown", onKey, true);
        }, 0);
        return () => {
            clearTimeout(id);
            window.removeEventListener("pointerdown", close, true);
            window.removeEventListener("scroll", close, true);
            window.removeEventListener("keydown", onKey, true);
        };
    }, [open, onClose]);

    if (!open || typeof document === "undefined") return null;
    return createPortal(
        <div
            ref={bubbleRef}
            role="tooltip"
            data-testid="long-press-bubble"
            style={style}
            className={clsx(
                "rounded-6 border-stroke bg-modal text-text shadow-modal backdrop-blur-32 text-body pointer-events-none z-[9999] max-w-[80vw] border px-8 py-6",
                className,
            )}
        >
            {children}
        </div>,
        document.body,
    );
}
