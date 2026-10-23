import { useSyncExternalStore } from "react";
import clsx from "clsx";
import { useTolgee } from "@tolgee/react";
import { twMerge } from "tailwind-merge";
import { TouchCaption } from "@/components/ui/InfoTip";
import { useShortcutOverridesStore } from "@/stores/ShortcutOverridesStore";
import type { ActionId } from "./definitions";
import { getActionTooltip } from "./labels";
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
    const title =
        tooltip ??
        getActionTooltip(action, (key, params) => t(key, params as never), {
            toggleState,
            overrides,
        });
    return (
        <button
            type="button"
            aria-label={caption !== undefined ? title : undefined}
            {...rest}
            disabled={disabled || !runnable}
            title={title}
            onClick={() => runAction(action)}
            className={twMerge(
                clsx(
                    "enabled:hover:text-accent outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
                    className,
                ),
            )}
        >
            {children}
            {caption !== undefined && <TouchCaption>{caption}</TouchCaption>}
        </button>
    );
}
