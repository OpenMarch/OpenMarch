import {
    useCallback,
    useEffect,
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
    isActionEnabled,
    runAction,
    subscribeToActionHandlers,
} from "./registry";

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
 * Disabled while the action has no enabled handler, so a click never silently does nothing.
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
    const runnable = useSyncExternalStore(subscribeToActionHandlers, () =>
        isActionEnabled(action),
    );
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
    const closeHint = useCallback(() => setHintOpen(false), []);
    const longPress = useLongPress(() => setHintOpen(true), {
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
                hoverTimer.current = setTimeout(
                    () => setHintOpen(true),
                    HOVER_HINT_MS,
                );
            }}
            onPointerLeave={(e) => {
                rest.onPointerLeave?.(e);
                if (e.pointerType !== "mouse") return;
                clearHoverTimer();
                if (isTouch) setHintOpen(false);
            }}
            data-own-long-press
            ref={setAnchor}
            disabled={disabled || !runnable}
            onClick={(event) => {
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
                action={showShortcut ? action : undefined}
                disabled={isTouch}
            >
                {button}
            </Tip>
            <LongPressBubble
                anchor={anchor}
                open={hintOpen}
                onClose={closeHint}
            >
                <span className="flex items-center gap-8">
                    <span>{hintLabel}</span>
                    {showShortcut && <Shortcut action={action} />}
                </span>
            </LongPressBubble>
        </>
    );
}
