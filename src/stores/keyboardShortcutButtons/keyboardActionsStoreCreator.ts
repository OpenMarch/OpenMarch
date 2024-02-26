import { KeyboardAction } from "@/global/classes/KeyboardAction";
import { type StateCreator } from "zustand";

export type KeyboardActionsStoreType = {
    keyboardActions: { [key: string]: () => any };
    /**
     * Initialize the keyboard actions store with the defined keyboard actions.
     *
     * THIS SHOULD NOT BE CALLED OUTSIDE OF THE KEYBOARDLISTENER COMPONENT.
     * @param definedKeyboardActions
     * @returns
     */
    initKeyboardActions: (definedKeyboardActions: { [key: string]: KeyboardAction }) => void;
    /**
     * If you want to register a keyboard shortcut to an action, you need to register the action here.
     *
     * @param key The ksyString the action is associated with (`keyboardAction.keyString`)
     * @param action The action to perform on the keyboard shortcut. Can be a button click, or any other action.
    * @returns
     */
    registerKeyboardAction: (key: string, action: () => any) => void;
};

export const keyboardActionsStoreCreator: StateCreator<KeyboardActionsStoreType> = (set) => ({
    keyboardActions: {},
    initKeyboardActions: (definedKeyboardActions: { [key: string]: KeyboardAction }) => {
        set({
            keyboardActions: Object.fromEntries(
                Object.values(definedKeyboardActions).map(
                    (keyboardAction) => [keyboardAction.keyString,
                    () => console.error(`No action registered for "${keyboardAction.instructionalString}"`)]
                )
            )
        })
    },
    registerKeyboardAction:
        (key, action) => {
            set((state) => {
                // keyboard actions can only be registered if they are defined in DefinedKeyboardActions
                if (state.keyboardActions[key])
                    return { ...state, keyboardActions: { ...state.keyboardActions, [key]: action } };
                else
                    throw new Error(`No keyboardAction registered for ${key}. This action must be defined in DefinedKeyboardActions.`);
            })
        },
});
