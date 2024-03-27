import { useCallback, useEffect } from "react";
import { KeyboardAction } from "@/global/classes/KeyboardAction";
import { useKeyboardActionsStore } from "./stores/keyboardShortcutButtons/useKeyboardActionsStore";

/**
 * The interface for the keyboard actions. This exists so it is easy to see what actions are available.
 */
export interface DefinedKeyboardActionsInterface {
    lockX: KeyboardAction;
    lockY: KeyboardAction;
    nextPage: KeyboardAction;
    lastPage: KeyboardAction;
    previousPage: KeyboardAction;
    firstPage: KeyboardAction;
    playPause: KeyboardAction;
    snapToNearestWhole: KeyboardAction;
    toggleNextPagePaths: KeyboardAction;
    togglePreviousPagePaths: KeyboardAction;
}

/**
 * Keyboard shortcuts for the application. All values must be unique.
 */
export const DefinedKeyboardActions: DefinedKeyboardActionsInterface = {
    lockX: new KeyboardAction({ key: "z", desc: "Lock X axis", toggleOnStr: "Enable X movement", toggleOffStr: "Lock X movement" }),
    lockY: new KeyboardAction({ key: "x", desc: "Lock Y axis", toggleOnStr: "Enable Y movement", toggleOffStr: "Lock Y movement" }),
    nextPage: new KeyboardAction({ key: "e", desc: "Next page" }),
    lastPage: new KeyboardAction({ key: "e", shift: true, desc: "Last page" }),
    previousPage: new KeyboardAction({ key: "q", desc: "Previous page" }),
    firstPage: new KeyboardAction({ key: "q", shift: true, desc: "First page" }),
    playPause: new KeyboardAction({ key: " ", desc: "Play or pause", toggleOnStr: "Play", toggleOffStr: "Pause" }),
    snapToNearestWhole: new KeyboardAction({ key: "1", desc: "Snap to nearest whole" }),
    togglePreviousPagePaths: new KeyboardAction({
        key: "n", desc: "Toggle viewing previous page paths",
        toggleOnStr: "Show previous page dots/paths", toggleOffStr: "Hide previous page dots/paths"
    }),
    toggleNextPagePaths: new KeyboardAction({
        key: "m", desc: "Toggle viewing next page paths",
        toggleOnStr: "Show next page dots/paths", toggleOffStr: "Hide next page dots/paths"
    }),
} as const;

/**
 * A listener for keyboard shortcuts.
 * This component uses a list of button refs to trigger button clicks when a keyboard shortcut is pressed.
 * @returns
 */
export default function KeyboardListener() {
    const { keyboardActions, initKeyboardActions } = useKeyboardActionsStore()!;

    /**
     * Handles the keyboard shortcuts for entire react side of the application.
     */
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (!document.activeElement?.matches("input, textarea, select, [contenteditable]")) {
            const keyString = KeyboardAction.makeKeyString({ key: e.key, control: e.ctrlKey || e.metaKey, alt: e.altKey, shift: e.shiftKey });
            if (keyboardActions[keyString]) {
                keyboardActions[keyString]();
                e.preventDefault();
            }
        }
    }, [keyboardActions]);

    useEffect(() => {
        // Check that all DefinedKeyboardActions are unique
        const actionsArray = Object.values(DefinedKeyboardActions);
        for (let curActionIdx = 0; curActionIdx < actionsArray.length; curActionIdx++) {
            for (let compareActionIdx = curActionIdx + 1; compareActionIdx < actionsArray.length; compareActionIdx++) {
                if (actionsArray[curActionIdx].keysEqual(actionsArray[compareActionIdx])) {
                    throw new Error(`DefinedKeyboardActions must have unique key . \
                    "${actionsArray[curActionIdx].desc}" and "${actionsArray[compareActionIdx].desc}" are not unique.\
                    Both have key "${actionsArray[curActionIdx].key}" and modifiers control: ${actionsArray[curActionIdx].control}, alt: ${actionsArray[curActionIdx].alt}, shift: ${actionsArray[curActionIdx].shift}`);
                }
            }
        }
        initKeyboardActions(DefinedKeyboardActions);
    }, [initKeyboardActions]);

    // register the keyboard listener to the window
    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [handleKeyDown]);
    return <></>; // Empty fragment
}
