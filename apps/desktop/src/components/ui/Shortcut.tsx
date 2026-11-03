import { Fragment } from "react";
import tolgee from "@/global/singletons/Tolgee";
import clsx from "clsx";
import {
    formatShortcutParts,
    spokenKeys,
    type ShortcutGesture,
} from "@/shortcuts/bindings";
import { getEffectiveBindings } from "@/shortcuts/keymap";
import type { ActionId } from "@/shortcuts/definitions";
import { isMacPlatform } from "@/shortcuts/platform";
import { useShortcutOverridesStore } from "@/stores/ShortcutOverridesStore";

export type ShortcutSize = "sm" | "md";

type Source =
    /** An action's first binding, as the user has it (custom bindings included) */
    | { action: ActionId; binding?: never; keys?: never }
    /** A binding string ("$mod+Shift+Z", "Alt + Q", "Shift+drag"), written for this platform */
    | { binding: string; action?: never; keys?: never }
    /** Keys already written for display, e.g. ["1–9"] or the output of `formatBindingKeys` */
    | { keys: readonly string[]; action?: never; binding?: never };

export type ShortcutProps = Source & {
    /** "sm" (default) in tooltips, menus, sentences and footers; "md" in lists of shortcuts */
    size?: ShortcutSize;
    className?: string;
    /** For tests: the platform, instead of the running one */
    isMac?: boolean;
};

/**
 * A keyboard shortcut, the one way the app shows one: a single cap holding the keys the way
 * each system writes them, "⇧⌘Z" on a Mac and "Ctrl+Shift+Z" elsewhere (with a lighter "+").
 * A screen reader hears the keys as words. Renders nothing for an action with no binding.
 */
export default function Shortcut(props: ShortcutProps) {
    const overrides = useShortcutOverridesStore((s) => s.overrides);
    const isMac = props.isMac ?? isMacPlatform();

    let keys: readonly string[];
    let gesture: ShortcutGesture | undefined;
    if (props.keys) {
        keys = props.keys;
    } else {
        const binding =
            props.binding ?? getEffectiveBindings(props.action, overrides)[0];
        if (!binding) return null;
        ({ keys, gesture } = formatShortcutParts(binding, isMac));
    }
    if (keys.length === 0 && !gesture) return null;

    const gestureWord = gesture && tolgee.t(`shortcut.gesture.${gesture}`);
    const spoken = [spokenKeys(keys), gestureWord].filter(Boolean).join(" ");
    const plain = keys.length === 1 && !gestureWord && spoken === keys[0];

    return (
        <kbd
            className={clsx(
                "shortcut",
                `shortcut-${props.size ?? "sm"}`,
                isMac && "shortcut-mac",
                props.className,
            )}
        >
            {/* One key that reads as itself ("J") needs no separate words */}
            {!plain && <span className="sr-only">{spoken}</span>}
            <span
                aria-hidden={plain ? undefined : true}
                className="shortcut-keys"
            >
                {keys.map((key, i) => (
                    <Fragment key={`${key}-${i}`}>
                        {i > 0 && !isMac && (
                            <span className="shortcut-plus">+</span>
                        )}
                        <kbd className="shortcut-key">{key}</kbd>
                    </Fragment>
                ))}
                {gestureWord && (
                    <>
                        {keys.length > 0 && !isMac && (
                            <span className="shortcut-plus">+</span>
                        )}
                        <span className="shortcut-gesture">{gestureWord}</span>
                    </>
                )}
            </span>
        </kbd>
    );
}
