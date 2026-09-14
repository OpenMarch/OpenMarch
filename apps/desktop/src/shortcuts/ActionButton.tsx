import clsx from "clsx";
import { useTolgee } from "@tolgee/react";
import { twMerge } from "tailwind-merge";
import type { ActionId } from "./definitions";
import { getActionTooltip } from "./labels";
import { runAction } from "./registry";

export type ActionButtonProps = Omit<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    "onClick"
> & {
    action: ActionId;
    /** Overrides the generated tooltip */
    tooltip?: string;
    /** Selects the toggle on/off label for toggle actions */
    toggleState?: "on" | "off";
};

/** A button that runs a registered action; its tooltip shows the current shortcut. */
export default function ActionButton({
    action,
    tooltip,
    toggleState,
    children,
    className,
    ...rest
}: ActionButtonProps) {
    const { t } = useTolgee();
    return (
        <button
            type="button"
            {...rest}
            title={
                tooltip ??
                getActionTooltip(
                    action,
                    (key, params) => t(key, params as never),
                    { toggleState },
                )
            }
            onClick={() => runAction(action)}
            className={twMerge(
                clsx(
                    "enabled:hover:text-accent outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
                    className,
                ),
            )}
        >
            {children}
        </button>
    );
}
