import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { SunIcon, MoonIcon } from "@phosphor-icons/react";
import { useTheme } from "@/context/ThemeContext";

export default function AppearanceSettings() {
    const { theme, setTheme } = useTheme();
    return (
        <div className="bg-fg-1 border-stroke rounded-6 flex flex-col gap-6 border p-12">
            <div className="flex h-[2.5rem] items-center justify-between px-8">
                <p className="text-body text-text-subtitle">Appearance</p>

                <ToggleGroup.Root
                    type="single"
                    value={theme}
                    onValueChange={(theme) => {
                        if (theme) setTheme(theme);
                    }}
                    className="flex h-fit w-fit gap-8"
                >
                    <ToggleGroup.Item
                        value="light"
                        className="text-text bg-fg-2 text-body border-stroke data-[state=on]:border-accent flex items-center gap-6 rounded-full border px-12 py-8 outline-hidden duration-150 ease-out focus-visible:-translate-y-4"
                    >
                        <SunIcon size={20} />
                        Light
                    </ToggleGroup.Item>
                    <ToggleGroup.Item
                        value="dark"
                        className="text-text bg-fg-2 text-body border-stroke data-[state=on]:border-accent flex items-center gap-6 rounded-full border px-12 py-8 outline-hidden duration-150 ease-out focus-visible:-translate-y-4"
                    >
                        <MoonIcon size={20} />
                        Dark
                    </ToggleGroup.Item>
                </ToggleGroup.Root>
            </div>
        </div>
    );
}
