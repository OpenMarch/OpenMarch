import { useCallback, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { TooltipClassName } from "@openmarch/ui";

/**
 * The transport's tooltips (UI-17): the control's name with its shortcut as muted keycaps, as
 * Figma and Linear show them. Shown after a short hover, and straight away on keyboard focus.
 * The page boxes' hold marks and keep chains and the inspector's hold line use them too (UI-18),
 * with `disableHoverableContent` so a tooltip above a page box never holds the pointer.
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

/** A keyboard shortcut ("Shift + Space", as `KeyboardShortcut.toString` writes it) as keycaps. */
export function Keycaps({ shortcut }: { shortcut: string }) {
    return (
        <span className="inline-flex items-center gap-2">
            {shortcut.split(/\s*\+\s*/).map((key) => (
                <kbd
                    key={key}
                    className="rounded-4 border-stroke bg-fg-2 text-text-subtitle border px-4 font-mono text-[11px] leading-[16px]"
                >
                    {key}
                </kbd>
            ))}
        </span>
    );
}

/**
 * Wraps one control (a button that forwards its ref) in a tooltip: `label`, then the shortcut's
 * keycaps, then an optional `hint` line. Needs a `TransportTooltipProvider` above it. Without a
 * `label` it never opens.
 *
 * With `closeOnPress` (the page boxes and the inspector's hold line, UI-18) it never shows while a
 * pointer is down on the control, so a click, drag, scrub or right-click goes on undisturbed: a
 * press closes it (and cancels a pending open), and it stays closed until the pointer leaves.
 */
export function ShortcutTooltip({
    label,
    shortcut,
    hint,
    side = "top",
    closeOnPress = false,
    children,
}: {
    label: string | undefined;
    shortcut?: string;
    hint?: string;
    side?: "top" | "bottom" | "left" | "right";
    closeOnPress?: boolean;
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
        <Tooltip.Root open={open && !!label} onOpenChange={onOpenChange}>
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
                        className={TooltipClassName}
                    >
                        <span className="flex items-center gap-8 text-[12px]">
                            {label}
                            {shortcut && <Keycaps shortcut={shortcut} />}
                        </span>
                        {hint && (
                            <span className="text-text-subtitle block text-[11px]">
                                {hint}
                            </span>
                        )}
                    </Tooltip.Content>
                </Tooltip.Portal>
            )}
        </Tooltip.Root>
    );
}
