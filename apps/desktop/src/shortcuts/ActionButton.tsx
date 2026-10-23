import { useCallback, useState, useSyncExternalStore } from "react";
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
                data-own-long-press
                ref={setAnchor}
                disabled={disabled || !runnable}
                title={title}
                onClick={() => runAction(action)}
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
