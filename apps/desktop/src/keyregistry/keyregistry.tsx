import React, { useEffect } from "react";
import KeyboardRegistry from "./KeyboardRegistry";
import CommandRegistry from "./CommandRegistry";
import { registerCommands } from "./registerListeners";

const useKeyRegistry = () => {
    const keyRegistry = new KeyboardRegistry();
    const commandRegistry = new CommandRegistry();

    function executeCommand(keyCombo: string) {
        const id = keyRegistry.getCommandForKey(keyCombo);
        if (!id) return;
        commandRegistry.execute(id);
    }

    function executeId(id: string) {
        commandRegistry.execute(id);
    }

    useEffect(() => {
        void registerCommands(keyRegistry, commandRegistry);
        const eventListener = (e: KeyboardEvent) => {
            const keys = [];
            if (e.ctrlKey) keys.push("ctrl");
            if (e.altKey) keys.push("alt");
            if (e.shiftKey) keys.push("shift");
            keys.push(e.key);

            const currentCombo = keys.join("+");
            executeCommand(currentCombo);
        };

        window.addEventListener("keydown", eventListener);
        return () => {
            window.removeEventListener("keydown", eventListener);
        };
    });

    return { executeId, executeCommand };
};

// context to wrap the app around
const KeyRegistryContext = React.createContext<ReturnType<
    typeof useKeyRegistry
> | null>(null);

export const KeyRegistryProvider: React.FC<{ children?: React.ReactNode }> = ({
    children,
}) => {
    const value = useKeyRegistry();
    return (
        <KeyRegistryContext.Provider value={value}>
            {children ?? null}
        </KeyRegistryContext.Provider>
    );
};

// components will use this in case something needs to access the hook properties
// although I don't see this being used but just in case idk
export const useKeyRegistryContext = () => {
    const ctx = React.useContext(KeyRegistryContext);
    if (!ctx)
        throw new Error(
            "useKeyRegistryContext must be used within KeyRegistryProvider",
        );
    return ctx;
};

export default useKeyRegistry;
