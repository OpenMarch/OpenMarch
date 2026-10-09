import type { ReactElement, ReactNode } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { TooltipClassName } from "@openmarch/ui";

/**
 * The transport's tooltips (UI-17): the control's name with its shortcut as muted keycaps, as
 * Figma and Linear show them. Shown after a short hover, and straight away on keyboard focus.
 */
export function TransportTooltipProvider({
    children,
}: {
    children: ReactNode;
}) {
    // A shorter skip delay than the app's, so moving along the row reads each control in turn
    return (
        <Tooltip.Provider delayDuration={500} skipDelayDuration={300}>
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
 * keycaps, then an optional `hint` line. Needs a `TransportTooltipProvider` above it.
 */
export function ShortcutTooltip({
    label,
    shortcut,
    hint,
    children,
}: {
    label: string;
    shortcut?: string;
    hint?: string;
    children: ReactElement;
}) {
    return (
        <Tooltip.Root>
            <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
            <Tooltip.Portal>
                <Tooltip.Content
                    // Above the transport, so it never covers the page boxes under it
                    side="top"
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
        </Tooltip.Root>
    );
}
