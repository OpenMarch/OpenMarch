import {
    useCallback,
    useEffect,
    useId,
    useLayoutEffect,
    useRef,
    useState,
    useSyncExternalStore,
} from "react";
import { useIsTouchMode } from "@/stores/InputModeStore";
import { LongPressBubble, useLongPress } from "@openmarch/ui";
import Shortcut from "@/components/ui/Shortcut";
import { Tip } from "@/components/ui/Tip";
import { useShowShortcutHints } from "@/stores/KeyboardSeenStore";
import clsx from "clsx";
import { useTranslate } from "@tolgee/react";
import { twMerge } from "tailwind-merge";
import { TouchCaption } from "@/components/ui/InfoTip";
import type { ActionArgs, ActionId } from "./definitions";
import { getActionLabel } from "./labels";
import { getActionDefinition } from "./definitions";
import {
    actionDisabledReason,
    isActionEnabled,
    onRefusedPress,
    runAction,
    subscribeToActionHandlers,
} from "./registry";

/** How long a refused key press shows the button's reason */
export const REFUSED_PRESS_MS = 2000;

/**
 * Whether the button is on screen to point at: not in a closed menu or a hidden panel, not
 * transparent, and inside the window (not scrolled out of its panel)
 */
const isShown = (el: HTMLElement) => {
    if (!el.isConnected) return false;
    if (
        typeof el.checkVisibility === "function" &&
        !el.checkVisibility({ visibilityProperty: true, opacityProperty: true })
    )
        return false;
    const box = el.getBoundingClientRect();
    // jsdom lays nothing out: a box of nothing there counts as shown
    if (box.width === 0 && box.height === 0) return true;
    return (
        box.bottom > 0 &&
        box.right > 0 &&
        box.top < window.innerHeight &&
        box.left < window.innerWidth
    );
};

/** How long a trackpad pointer rests on the button before its hint shows (touch layout). */
const HOVER_HINT_MS = 600;

export type ActionButtonProps =
    React.ButtonHTMLAttributes<HTMLButtonElement> & {
        action: ActionId;
        /** Passed to the action when the button runs it, e.g. a variant its key doesn't need */
        args?: ActionArgs;
        /** Overrides the generated tooltip (then without the shortcut); "" for none */
        tooltip?: string;
        /** Selects the toggle on/off label for toggle actions */
        toggleState?: "on" | "off";
        /**
         * A short word or two shown with the icon in touch mode, where the tooltip
         * can't be seen. Give it to icon-only buttons.
         */
        caption?: string;
        /** Called after the action runs, e.g. to close the menu the button sits in */
        onRun?: () => void;
    };

/**
 * A button that runs a registered action. Its tooltip, the app's own (`Tip`), shows the action's
 * name and current shortcut; in the touch layout a long press (or a resting trackpad) shows them.
 * Disabled while the action has no enabled handler, so a click never silently does nothing. When
 * the action gives a reason (`useActionHandler`'s `disabledReason`), the button stays focusable
 * and says why, in its tooltip, long press and description, instead of a toast after a press.
 * An `onClick` runs first, and `preventDefault` there keeps the action from running.
 */
export default function ActionButton({
    action,
    args,
    tooltip,
    toggleState,
    caption,
    onRun,
    children,
    className,
    disabled,
    onClick,
    ...rest
}: ActionButtonProps) {
    const { t } = useTranslate();
    // Whether it can run, and when it can't, why: a new reason re-renders it too
    const state = useSyncExternalStore(subscribeToActionHandlers, () =>
        isActionEnabled(action) ? null : (actionDisabledReason(action) ?? ""),
    );
    const runnable = state === null;
    const reason = !disabled && state ? state : undefined;
    const reasonId = useId();
    const translate = (key: string, params?: Record<string, string | number>) =>
        t(key, params as never);
    // A finger can't hover for the tooltip: a long press explains the button instead of running it
    const [hintOpen, setHintOpen] = useState(false);
    const isTouch = useIsTouchMode();
    const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const clearHoverTimer = () => {
        if (hoverTimer.current !== null) clearTimeout(hoverTimer.current);
        hoverTimer.current = null;
    };
    useEffect(() => clearHoverTimer, []);
    const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
    // A key press for this action that can't run now: the button lights up and shows why for a
    // moment, instead of a toast (or nothing at all). Only a button with a reason to show does
    const [flash, setFlash] = useState(false);
    // What opened the reason: a press on the button (Escape is then the bubble's) or a refused
    // key (Escape still does what it does)
    const openedBy = useRef<"press" | "key">("press");
    const reasonRef = useRef(reason);
    reasonRef.current = reason;
    useEffect(() => {
        if (!anchor) return;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const end = () => {
            if (timer !== null) clearTimeout(timer);
            timer = null;
            setFlash(false);
        };
        const off = onRefusedPress((id) => {
            if (id !== action || !reasonRef.current || !isShown(anchor))
                return false;
            if (timer !== null) clearTimeout(timer);
            openedBy.current = "key";
            setFlash(true);
            setHintOpen(true);
            timer = setTimeout(() => {
                end();
                setHintOpen(false);
            }, REFUSED_PRESS_MS);
            return true;
        });
        return () => {
            off();
            // A flash that's cut short (the action changed, or the button went) ends now
            if (timer !== null) {
                end();
                setHintOpen(false);
            }
        };
    }, [action, anchor]);
    // Escape closes a reason the button's press opened, and nothing else: the app's own Escape
    // (cancel a tool) must not run under it. Listening in the capture phase, it's handled before
    // the shortcuts are. One a refused key opened just closes, and Escape goes on as usual
    useEffect(() => {
        if (!hintOpen || !reason) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            if (openedBy.current === "press") event.stopPropagation();
            setHintOpen(false);
            setFlash(false);
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [hintOpen, reason]);
    // The light goes with the reason (a click elsewhere or a scroll closes it)
    const closeHint = useCallback(() => {
        setHintOpen(false);
        setFlash(false);
    }, []);
    const openHint = () => {
        openedBy.current = "press";
        setHintOpen(true);
    };
    const longPress = useLongPress(openHint, {
        onPointerDown: rest.onPointerDown,
        onPointerMove: rest.onPointerMove,
        onPointerUp: rest.onPointerUp,
        onPointerCancel: rest.onPointerCancel,
        onClickCapture: rest.onClickCapture,
        onContextMenu: rest.onContextMenu,
    });
    const definition = getActionDefinition(action);
    const toggleKey =
        toggleState === "on"
            ? definition.toggleOnKey
            : toggleState === "off"
              ? definition.toggleOffKey
              : undefined;
    const hintLabel =
        tooltip ??
        (toggleKey ? t(toggleKey) : getActionLabel(action, translate));
    const showHints = useShowShortcutHints();
    // A custom tooltip is shown as written, without the shortcut
    const showShortcut = showHints && tooltip === undefined;
    // The tooltip used to be the title, which also named an icon-only button; name it instead
    const [hasText, setHasText] = useState(false);
    useLayoutEffect(() => {
        const visibleText = [...(anchor?.childNodes ?? [])]
            .filter(
                (node) =>
                    !(
                        node instanceof HTMLElement &&
                        node.dataset.touchCaption !== undefined
                    ),
            )
            .map((node) => node.textContent ?? "")
            .join("")
            .trim();
        setHasText(visibleText !== "");
    }, [anchor, children]);
    const button = (
        <button
            type="button"
            aria-label={
                caption !== undefined || !hasText
                    ? hintLabel || undefined
                    : undefined
            }
            {...rest}
            {...longPress}
            onPointerEnter={(e) => {
                rest.onPointerEnter?.(e);
                // A trackpad in the touch layout (iPad): Safari shows no title tooltips, so show the hint
                if (e.pointerType !== "mouse" || !isTouch) return;
                clearHoverTimer();
                hoverTimer.current = setTimeout(openHint, HOVER_HINT_MS);
            }}
            onPointerLeave={(e) => {
                rest.onPointerLeave?.(e);
                if (e.pointerType !== "mouse") return;
                clearHoverTimer();
                // The touch layout's hover hint, and a clicked reason, go with the pointer
                setHintOpen(false);
            }}
            data-own-long-press
            ref={setAnchor}
            // With a reason it stays focusable and hoverable, so the reason can be read
            disabled={reason ? undefined : disabled || !runnable}
            aria-disabled={reason ? true : undefined}
            aria-describedby={reason ? reasonId : rest["aria-describedby"]}
            onClick={(event) => {
                if (reason) {
                    // Pressing it shows why instead, as the menus' entries do: a press closes
                    // the tooltip, and a finger has no hover
                    event.preventDefault();
                    openHint();
                    return;
                }
                // A caller's onClick can take the click over with preventDefault
                onClick?.(event);
                if (event.defaultPrevented) return;
                runAction(action, args);
                onRun?.();
            }}
            className={twMerge(
                clsx(
                    "enabled:hover:text-accent touch:select-none touch:[-webkit-touch-callout:none] outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
                    className,
                    // Looks as a disabled one does, without the hover color
                    reason &&
                        "cursor-not-allowed opacity-50 enabled:hover:text-inherit",
                    flash && "ring-accent/50 ring-2",
                ),
            )}
        >
            {children}
            {caption !== undefined && <TouchCaption>{caption}</TouchCaption>}
        </button>
    );
    return (
        <>
            {/* The touch layout shows the long-press bubble instead */}
            <Tip
                label={hintLabel || undefined}
                hint={reason}
                action={showShortcut ? action : undefined}
                disabled={isTouch}
            >
                {button}
            </Tip>
            {/* The button's description, outside it so it isn't part of the name */}
            {reason && (
                <span id={reasonId} className="sr-only">
                    {reason}
                </span>
            )}
            <LongPressBubble
                anchor={anchor}
                open={hintOpen}
                onClose={closeHint}
            >
                <span className="flex flex-col gap-2">
                    <span className="flex items-center gap-8">
                        <span>{hintLabel}</span>
                        {showShortcut && <Shortcut action={action} />}
                    </span>
                    {reason && (
                        <span className="text-sub text-text-subtitle">
                            {reason}
                        </span>
                    )}
                </span>
            </LongPressBubble>
        </>
    );
}
