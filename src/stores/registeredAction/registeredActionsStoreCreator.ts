import { RegisteredActionsEnum } from "@/utilities/RegisteredActionsHandler";
import { type StateCreator } from "zustand";

export type RegisteredActionsStoreType = {
    registeredButtonActions: { registeredAction: RegisteredActionsEnum, buttonRef: React.RefObject<HTMLButtonElement> }[];
    /**
     * If you want a button in a component to trigger a RegisteredAction,
     * you need to register the button here for the action.
     *
     * @param registeredAction The RegisteredActionEnum to be triggered by the button.
     * @param buttonRef The button element that will trigger the action.
     * @returns
     */
    linkRegisteredAction: (registeredAction: RegisteredActionsEnum, buttonRef: React.RefObject<HTMLButtonElement>) => void;
};

export const registeredActionsStoreCreator: StateCreator<RegisteredActionsStoreType> = (set) => ({
    registeredButtonActions: [],
    linkRegisteredAction: (registeredAction, buttonRef) => {
        set((state) => {
            return { ...state, registeredButtonActions: [...state.registeredButtonActions, { registeredAction, buttonRef }] };
        })
    },
});
