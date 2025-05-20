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
                className="text-text data-[state=on]:text-accent outline-hidden duration-150 ease-out focus-visible:-translate-y-4"
            >
                <Sun size={18} />
            </ToggleGroup.Item>
            <ToggleGroup.Item
                value="dark"
                className="text-text data-[state=on]:text-accent outline-hidden duration-150 ease-out focus-visible:-translate-y-4"
            >
                <Moon size={18} />
            </ToggleGroup.Item>
        </ToggleGroup.Root>
    );
}
