import type { ReactNode } from "react";
import clsx from "clsx";
import { getButtonClassName } from "@openmarch/ui";
import { Tip } from "@/components/ui/Tip";
import type { ActionId } from "@/shortcuts/definitions";
import { keepFocus } from "./keepFocus";

/**
 * The floating editor's parts, shared by every editor that floats beside what it edits on the
 * field: the shape's (`ShapeEditorBar`) and a path's (`pathways/PathEditor`), so they look and
 * behave as one.
 */

/** The bar itself: opaque, with the app's modal border and shadow; add the row or column layout */
export const EDITOR_BAR =
    "rounded-6 border-stroke bg-bg-1 bg-modal shadow-modal flex items-center border px-6 py-4";

/** A thin upright line between groups of controls */
export function Divider() {
    return <span className="bg-stroke h-16 w-px" aria-hidden />;
}

/**
 * The editor's one main action, a primary pill (a new shape's Place, a path's Finish). A press
 * keeps focus where it was, as every control in the editor does.
 */
export function EditorButton({
    onClick,
    testId,
    children,
}: {
    onClick: () => void;
    testId?: string;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            // text-body after twMerge, which drops it (docs/conventions/ui-styling.md)
            className={`${getButtonClassName({
                variant: "primary",
                size: "compact",
            })} text-body`}
            onPointerDown={keepFocus}
            onClick={onClick}
            data-testid={testId}
        >
            {children}
        </button>
    );
}

/** An icon with no outline, its name and shortcut in its tooltip; lit in the accent while `pressed` */
export function IconButton({
    label,
    action,
    className,
    onClick,
    disabled,
    pressed,
    testId,
    children,
    onDisabledClick,
}: {
    label: string;
    /** The action it runs, whose shortcut the tooltip shows */
    action?: ActionId;
    className?: string;
    onClick: () => void;
    disabled?: boolean;
    pressed?: boolean;
    testId?: string;
    children: ReactNode;
    /**
     * A press while disabled, so a finger (which gets no tooltip) can still be told why, as a
     * toast. Nothing happens without it.
     */
    onDisabledClick?: () => void;
}) {
    return (
        <Tip label={label} action={action}>
            <button
                type="button"
                aria-label={label}
                aria-pressed={pressed}
                // aria-disabled, not disabled: a disabled button gets no pointer, so its tooltip
                // (which says why, as Recalculate's does) wouldn't show
                aria-disabled={disabled || undefined}
                onPointerDown={keepFocus}
                onClick={() => {
                    if (!disabled) onClick();
                    else onDisabledClick?.();
                }}
                data-testid={testId}
                className={clsx(
                    // At least 24 px to hit (WCAG 2.2 target size; review round r429)
                    "rounded-4 flex min-h-24 min-w-24 items-center justify-center gap-4 p-4",
                    // On: the icon in the accent on a light accent tint, so the state is plain at a
                    // glance without reading as a solid button (owner)
                    pressed ? "bg-accent/15 text-accent" : "hover:text-accent",
                    disabled && "cursor-default opacity-40 hover:text-inherit",
                    className,
                )}
            >
                {children}
            </button>
        </Tip>
    );
}
