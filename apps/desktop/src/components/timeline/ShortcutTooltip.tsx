import { useCallback, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { TooltipClassName } from "@openmarch/ui";
import Shortcut from "@/components/ui/Shortcut";
import type { ActionId } from "@/shortcuts/definitions";

/**
 * The transport's tooltips (UI-17): the control's name with its shortcut as muted keycaps, as
 * Figma and Linear show them. Shown after a short hover, and straight away on keyboard focus.
 * The keyframe diamonds (#303) and the inspector's hold line use them too (UI-18), with
 * `disableHoverableContent` so a tooltip above a page box never holds the pointer.
 */
export function TransportTooltipProvider({
    children,
    disableHoverableContent,
}: {
    children: ReactNode;
    disableHoverableContent?: boolean;
}) {
    // A shorter skip delay than the app's, so moving along the row reads each control in turn
    return (
        <Tooltip.Provider
            delayDuration={500}
            skipDelayDuration={300}
            disableHoverableContent={disableHoverableContent}
        >
            {children}
        </Tooltip.Provider>
    );
}

/**
 * Wraps one control (a button that forwards its ref) in a tooltip: `label`, then the shortcut
 * (`shortcut`, a binding, or `action`, the action's own as the user has bound it), then an optional `hint` line. Needs a `TransportTooltipProvider` above it. Without a
 * `label` it never opens; with `hideLabel` it opens but doesn't write the label (the control's
 * accessible name stays), for a `hint` that says everything.
 *
 * With `closeOnPress` (the keyframe diamonds and the inspector's hold line, UI-18) it never shows while a
 * pointer is down on the control, so a click, drag, scrub or right-click goes on undisturbed: a
 * press closes it (and cancels a pending open), and it stays closed until the pointer leaves.
 */
export function ShortcutTooltip({
    label,
    shortcut,
    action,
    hint,
    hideLabel = false,
    side = "top",
    closeOnPress = false,
    disabled = false,
    children,
}: {
    label: string | undefined;
    /** A binding ("Shift + Space", "$mod+Z") shown as a `Shortcut` */
    shortcut?: string;
    /** An action whose shortcut to show, as the user has bound it (instead of `shortcut`) */
    action?: ActionId;
    /** A second line, or a richer guide (the transport's Previous and Next) */
    hint?: ReactNode;
    hideLabel?: boolean;
    side?: "top" | "bottom" | "left" | "right";
    closeOnPress?: boolean;
    /** Never opens (the touch layout explains controls with a long press instead) */
    disabled?: boolean;
    children: ReactElement;
}) {
    const [open, setOpen] = useState(false);
    // Set by a press, cleared when the pointer leaves: an open the hover's delay asks for while
    // the pointer is down (or after it's released over the control) is ignored
    const pressed = useRef(false);
    const onOpenChange = useCallback((next: boolean) => {
        setOpen(next && !pressed.current);
    }, []);
    return (
        <Tooltip.Root
            open={open && !!label && !disabled}
            onOpenChange={onOpenChange}
        >
            <Tooltip.Trigger
                asChild
                onPointerDown={
                    closeOnPress
                        ? () => {
                              pressed.current = true;
                              setOpen(false);
                          }
                        : undefined
                }
                onPointerLeave={
                    closeOnPress
                        ? () => {
                              pressed.current = false;
                          }
                        : undefined
                }
            >
                {children}
            </Tooltip.Trigger>
            {label && (
                <Tooltip.Portal>
                    <Tooltip.Content
                        // Above the transport, so it never covers the page boxes under it
                        side={side}
                        sideOffset={4}
                        // kept clear of the window's edges, not just inside them
                        collisionPadding={8}
                        className={TooltipClassName}
                    >
                        {!hideLabel && (
                            <span className="text-body flex items-center gap-8">
                                {label}
                                {action ? (
                                    <Shortcut action={action} />
                                ) : (
                                    shortcut && <Shortcut binding={shortcut} />
                                )}
                            </span>
                        )}
                        {typeof hint === "string" ? (
                            <span className="text-text-subtitle text-sub block">
                                {hint}
                            </span>
                        ) : (
                            hint
                        )}
                    </Tooltip.Content>
                </Tooltip.Portal>
            )}
        </Tooltip.Root>
    );
}
