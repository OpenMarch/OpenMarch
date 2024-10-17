import { useState, useEffect } from "react";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { Sun, Moon } from "@phosphor-icons/react";

export default function ThemeSwitcher() {
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
            className="titlebar-button flex h-fit w-fit gap-12"
        >
            <ToggleGroup.Item
                value="light"
                className="text-text outline-none duration-150 ease-out focus-visible:-translate-y-4 data-[state=on]:text-accent"
            >
                <Sun size={18} />
            </ToggleGroup.Item>
            <ToggleGroup.Item
                value="dark"
                className="text-text outline-none duration-150 ease-out focus-visible:-translate-y-4 data-[state=on]:text-accent"
            >
                <Moon size={18} />
            </ToggleGroup.Item>
        </ToggleGroup.Root>
    );
}
