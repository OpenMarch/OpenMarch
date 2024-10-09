import { useCursorModeStore } from "@/stores/cursorMode/useCursorModeStore";
import { useState, useEffect } from "react";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { Sun, Moon } from "@phosphor-icons/react";

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
    const [theme, setTheme] = useState<string>("light");

    useEffect(() => {
        window.electron.getTheme().then((storedTheme: string | null) => {
            if (storedTheme) {
                applyTheme(storedTheme);
            } else {
                const preferredTheme = getSystemTheme();
                applyTheme(preferredTheme);
            }
        });
    }, []);

    function getSystemTheme() {
        return window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light";
    }

    function applyTheme(theme: string) {
        setTheme(theme);
        window.electron.setTheme(theme);
        if (theme === "dark") {
            document.documentElement.classList.add("dark");
        } else {
            document.documentElement.classList.remove("dark");
        }
    }

    return (
        <ToggleGroup.Root
            type="single"
            value={theme}
            onValueChange={(theme) => {
                if (theme) applyTheme(theme);
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
