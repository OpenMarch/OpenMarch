import { RegisteredActionsEnum } from "@/utilities/RegisteredActionsHandler";
import { create } from "zustand";

type RegisteredActionsStoreType = {
    registeredButtonActions: {
        registeredAction: RegisteredActionsEnum;
        buttonRef: React.RefObject<HTMLButtonElement>;
    }[];
    /**
     * If you want a button in a component to trigger a RegisteredAction,
     * you need to register the button here for the action.
     *
     * @param registeredAction The RegisteredActionEnum to be triggered by the button.
     * @param buttonRef The button element that will trigger the action.
     */
    linkRegisteredAction: (
        registeredAction: RegisteredActionsEnum,
        buttonRef: React.RefObject<HTMLButtonElement>,
    ) => void;
    /**
     * Removes a button ref from the store of registered actions. Use this on unmount.
     *
     * @param registeredAction The RegisteredActionEnum that belongs to the button.
     * @param buttonRef The button ref to remove
     */
    removeRegisteredAction: (
        registeredAction: RegisteredActionsEnum,
        buttonRef: React.RefObject<HTMLButtonElement>,
    ) => void;
};

export const useRegisteredActionsStore = create<RegisteredActionsStoreType>(
    (set) => ({
        registeredButtonActions: [],
        linkRegisteredAction: (registeredAction, buttonRef) => {
            set((state) => {
                return {
                    ...state,
                    registeredButtonActions: [
                        ...state.registeredButtonActions,
                        { registeredAction, buttonRef },
                    ],
                };
            });
        },
        removeRegisteredAction: (registeredAction, buttonRef) => {
            set((state) => {
                const updatedButtonActions =
                    state.registeredButtonActions.filter(
                        (action) =>
                            action.registeredAction !== registeredAction ||
                            action.buttonRef !== buttonRef,
                    );
                return {
                    ...state,
                    registeredButtonActions: updatedButtonActions,
                };
            });
        },
    }),
);
