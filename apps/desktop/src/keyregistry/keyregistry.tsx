import React, { useCallback, useEffect, useMemo } from "react";
import KeyboardRegistry from "./KeyboardRegistry";
import CommandRegistry from "./CommandRegistry";
import { registerCommands } from "./registerListeners";

const useKeyRegistry = () => {
    const keyRegistry = useMemo(() => new KeyboardRegistry(), []);
    const commandRegistry = useMemo(() => new CommandRegistry(), []);

    const executeCommand = useCallback(
        (keyCombo: string) => {
            const id = keyRegistry.getCommandForKey(keyCombo);
            if (!id) return;
            commandRegistry.execute(id);
        },
        [keyRegistry, commandRegistry],
    );

    const executeId = useCallback(
        (id: string) => {
            commandRegistry.execute(id);
        },
        [commandRegistry],
    );

    useEffect(() => {
        registerCommands(keyRegistry, commandRegistry).catch((error) => {
            console.error("Failed to register commands:", error);
        });

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
    }, [keyRegistry, commandRegistry, executeCommand]);

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
