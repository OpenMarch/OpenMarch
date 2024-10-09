import { useCursorModeStore } from "@/stores/cursorMode/useCursorModeStore";
import React from "react";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import Store from "electron-store";
import { Sun, Moon } from "@phosphor-icons/react";

const store = new Store();

export default function StatusBar() {
    const { cursorMode } = useCursorModeStore();
    return (
        <div className="flex h-fit w-full items-center justify-between px-24 py-8 text-text">
            <div className="flex items-center gap-12">
                <ThemeSwitcher />
                <p className="text-sub leading-none">
                    Cursor Mode: {cursorMode}
                </p>
            </div>
            <div className="flex items-center gap-12">
                <p className="text-sub leading-none">OpenMarch</p>
            </div>
        </div>
    );
}

// -------- theme switcher ---------

function ThemeSwitcher() {
    const [theme, setTheme] = React.useState(() => {
        return store.get("theme", getInitialTheme()) as string;
    });

    function applyTheme(theme: string) {
        if (theme === "dark") {
            document.documentElement.classList.add("dark");
        } else {
            document.documentElement.classList.remove("dark");
        }
    }

    function getInitialTheme() {
        return window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light";
    }

    React.useEffect(() => {
        applyTheme(theme);
        store.set("theme", theme);
    }, [theme]);

    return (
        <ToggleGroup.Root
            type="single"
            value={theme}
            onValueChange={(theme) => {
                if (theme) setTheme(theme);
            }}
            className="flex h-fit w-fit gap-6"
        >
            <ToggleGroup.Item
                value="light"
                className="shadow-material-component data-[state=on]:bg-accent-reversed data-[state=on]:text-text-reversed data-[state=on]:shadow-colored-component flex size-32 items-center justify-center rounded-full border border-stroke text-text"
            >
                <Sun size={18} />
            </ToggleGroup.Item>
            <ToggleGroup.Item
                value="dark"
                className="shadow-material-component data-[state=on]:bg-accent-reversed data-[state=on]:text-text-reversed data-[state=on]:shadow-colored-component flex size-32 items-center justify-center rounded-full border border-stroke text-text"
            >
                <Moon size={18} />
            </ToggleGroup.Item>
        </ToggleGroup.Root>
    );
}
