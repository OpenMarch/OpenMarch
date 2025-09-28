import * as ToggleGroup from "@radix-ui/react-toggle-group";
import * as Select from "@radix-ui/react-select";
import {
    SunIcon,
    MoonIcon,
    CaretDownIcon,
    CheckIcon,
} from "@phosphor-icons/react";
import { useTheme } from "@/context/ThemeContext";
import { useTolgee, T } from "@tolgee/react";
import { useState, useEffect } from "react";

const languages = [
    { code: "en", name: "English" },
    { code: "es", name: "Español" },
    { code: "pt-BR", name: "Português (Brasil)" },
    { code: "ja", name: "日本語" },
];

// eslint-disable-next-line max-lines-per-function
export default function GeneralSettings() {
    const { theme, setTheme } = useTheme();
    const tolgee = useTolgee();
    const [currentLanguage, setCurrentLanguage] = useState("en");

    useEffect(() => {
        // Load saved language from electron store
        const loadLanguage = async () => {
            const savedLanguage = await window.electron.getLanguage();
            if (savedLanguage) {
                setCurrentLanguage(savedLanguage);
                await tolgee.changeLanguage(savedLanguage);
            } else {
                const lang = tolgee.getLanguage();
                setCurrentLanguage(lang || "en");
            }
        };
        void loadLanguage();
    }, [tolgee]);

    const handleLanguageChange = async (languageCode: string) => {
        try {
            await tolgee.changeLanguage(languageCode);
            setCurrentLanguage(languageCode);
            // Save to electron store
            await window.electron.setLanguage(languageCode);
        } catch (error) {
            console.error("Failed to change language:", error);
        }
    };

    const currentLanguageName =
        languages.find((lang) => lang.code === currentLanguage)?.name ||
        "English";

    return (
        <div className="bg-fg-1 border-stroke rounded-6 flex flex-col gap-6 border p-12">
            <div className="flex h-[2.5rem] items-center justify-between px-8">
                <p className="text-body text-text-subtitle">
                    <T keyName="settings.general.appearance" />
                </p>

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
                        <T keyName="settings.general.appearance.light" />
                    </ToggleGroup.Item>
                    <ToggleGroup.Item
                        value="dark"
                        className="text-text bg-fg-2 text-body border-stroke data-[state=on]:border-accent flex items-center gap-6 rounded-full border px-12 py-8 outline-hidden duration-150 ease-out focus-visible:-translate-y-4"
                    >
                        <MoonIcon size={20} />
                        <T keyName="settings.general.appearance.dark" />
                    </ToggleGroup.Item>
                </ToggleGroup.Root>
            </div>

            <div className="flex h-[2.5rem] items-center justify-between px-8">
                <p className="text-body text-text-subtitle">
                    <T keyName="settings.general.language" />
                </p>

                <Select.Root
                    value={currentLanguage}
                    onValueChange={handleLanguageChange}
                >
                    <Select.Trigger className="text-text bg-fg-2 text-body border-stroke hover:border-accent flex min-w-[120px] items-center justify-between gap-6 rounded-full border px-12 py-8 outline-hidden duration-150 ease-out focus-visible:-translate-y-4">
                        <Select.Value placeholder={currentLanguageName} />
                        <Select.Icon>
                            <CaretDownIcon size={16} />
                        </Select.Icon>
                    </Select.Trigger>

                    <Select.Portal>
                        <Select.Content
                            className="bg-fg-1 border-stroke rounded-6 z-50 overflow-hidden border shadow-lg backdrop-blur-sm"
                            position="popper"
                            side="bottom"
                            align="center"
                            sideOffset={4}
                        >
                            <Select.Viewport className="p-4">
                                {languages.map((language) => (
                                    <Select.Item
                                        key={language.code}
                                        value={language.code}
                                        className="text-text hover:bg-fg-2 rounded-4 focus:bg-fg-2 flex cursor-pointer items-center justify-between px-12 py-8 outline-hidden duration-150 ease-out"
                                    >
                                        <Select.ItemText>
                                            {language.name}
                                        </Select.ItemText>
                                        <Select.ItemIndicator>
                                            <CheckIcon size={16} />
                                        </Select.ItemIndicator>
                                    </Select.Item>
                                ))}
                            </Select.Viewport>
                        </Select.Content>
                    </Select.Portal>
                </Select.Root>
            </div>
        </div>
    );
}
