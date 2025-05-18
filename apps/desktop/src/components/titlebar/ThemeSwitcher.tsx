import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { Sun, Moon } from "@phosphor-icons/react";
import { useTheme } from "@/context/ThemeContext";

export default function ThemeSwitcher() {
    const { theme, setTheme } = useTheme();

    return (
        <ToggleGroup.Root
            type="single"
            value={theme}
            onValueChange={(theme) => {
                if (theme) setTheme(theme);
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
