import {
    createContext,
    useContext,
    type ReactElement,
    type ReactNode,
} from "react";
import {
    ShortcutTooltip,
    TransportTooltipProvider,
} from "@/components/timeline/ShortcutTooltip";
import type { ActionId } from "@/shortcuts/definitions";

const InRichTips = createContext(false);

/**
 * One tooltip timing for the controls inside, as the timeline's transport has: moving along a
 * row reads each control in turn (the floating editor). {@link Tip} works without it too.
 */
export function RichTips({ children }: { children: ReactNode }) {
    return (
        <TransportTooltipProvider disableHoverableContent>
            <InRichTips.Provider value={true}>{children}</InRichTips.Provider>
        </TransportTooltipProvider>
    );
}

/**
 * A control's tooltip: the app's own (the timeline's `ShortcutTooltip`), never
 * a browser `title` (owner, #429). It never shows while the control is pressed, so a number's
 * drag goes on undisturbed. `children` is one element that takes a ref, such as a `<button>`;
 * with no `label` it has no tooltip. `action` adds that action's shortcut (as the user has bound
 * it), `shortcut` a binding of keys that aren't an action, and `hint` a second line.
 */
export function Tip({
    label,
    shortcut,
    action,
    hint,
    disabled,
    children,
}: {
    label: string | undefined;
    /** A binding ("Shift + Space") for keys that aren't an action */
    shortcut?: string;
    /** The action whose shortcut the tooltip shows */
    action?: ActionId;
    /** A second, quieter line: the whole of a description shown cut short */
    hint?: string;
    /** Never opens, while keeping the control's place in the tree */
    disabled?: boolean;
    children: ReactElement;
}) {
    const shared = useContext(InRichTips);
    if (!label) return children;
    const tip = (
        <ShortcutTooltip
            label={label}
            shortcut={shortcut}
            action={action}
            hint={hint}
            disabled={disabled}
            closeOnPress
        >
            {children}
        </ShortcutTooltip>
    );
    return shared ? (
        tip
    ) : (
        <TransportTooltipProvider disableHoverableContent>
            {tip}
        </TransportTooltipProvider>
    );
}
