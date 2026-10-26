import {
    useCallback,
    useEffect,
    useRef,
    useState,
    useSyncExternalStore,
} from "react";
import { useIsTouchMode } from "@/stores/InputModeStore";
import { LongPressBubble, useLongPress } from "@openmarch/ui";
import Keycaps from "@/components/ui/Keycaps";
import { useShowShortcutHints } from "@/stores/KeyboardSeenStore";
import clsx from "clsx";
import { useTolgee } from "@tolgee/react";
import { twMerge } from "tailwind-merge";
import { TouchCaption } from "@/components/ui/InfoTip";
import { useShortcutOverridesStore } from "@/stores/ShortcutOverridesStore";
import type { ActionId } from "./definitions";
import {
    getActionLabel,
    getActionShortcutKeys,
    getActionTooltip,
} from "./labels";
import { getActionDefinition } from "./definitions";
import {
    isActionEnabled,
    runAction,
    subscribeToActionHandlers,
} from "./registry";

/** How long a trackpad pointer rests on the button before its hint shows (touch layout). */
const HOVER_HINT_MS = 600;

export type ActionButtonProps = Omit<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    "onClick"
> & {
    action: ActionId;
    /** Overrides the generated tooltip */
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
 * A button that runs a registered action; its tooltip shows the current shortcut.
 * Disabled while the action has no enabled handler, so a click never silently does nothing.
 */
export default function ActionButton({
    action,
    tooltip,
    toggleState,
    caption,
    onRun,
    children,
    className,
    disabled,
    ...rest
}: ActionButtonProps) {
    const { t } = useTolgee();
    const overrides = useShortcutOverridesStore((s) => s.overrides);
    const runnable = useSyncExternalStore(subscribeToActionHandlers, () =>
        isActionEnabled(action),
    );
    const translate = (key: string, params?: Record<string, string | number>) =>
        t(key, params as never);
    const title =
        tooltip ??
        getActionTooltip(action, translate, {
            toggleState,
            overrides,
        });
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
    const shortcutKeys = showHints
        ? getActionShortcutKeys(action, { overrides })
        : undefined;
    return (
        <>
            <button
                type="button"
                aria-label={caption !== undefined ? title : undefined}
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
                title={title}
                onClick={() => {
                    runAction(action);
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
                {caption !== undefined && (
                    <TouchCaption>{caption}</TouchCaption>
                )}
            </button>
            <LongPressBubble
                anchor={anchor}
                open={hintOpen}
                onClose={closeHint}
            >
                <span className="flex items-center gap-8">
                    <span>{hintLabel}</span>
                    {shortcutKeys && <Keycaps keys={shortcutKeys} />}
                </span>
            </LongPressBubble>
        </>
    );
}
