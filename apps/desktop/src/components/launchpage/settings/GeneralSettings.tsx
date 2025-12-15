import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { SunIcon, MoonIcon } from "@phosphor-icons/react";
import { useTheme } from "@/context/ThemeContext";
import { useTolgee, T } from "@tolgee/react";
import { useState, useEffect } from "react";
import {
    Switch,
    Select,
    SelectContent,
    SelectItem,
    SelectTriggerButton,
} from "@openmarch/ui";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";

const languages = [
    { code: "en", name: "English" },
    { code: "es", name: "Español" },
    { code: "fr", name: "Français" },
    { code: "pt-BR", name: "Português (Brasil)" },
    { code: "ja", name: "日本語" },
];

// eslint-disable-next-line max-lines-per-function
export default function GeneralSettings() {
    const { theme, setTheme } = useTheme();
    const tolgee = useTolgee();
    const [currentLanguage, setCurrentLanguage] = useState("en");
    const { uiSettings, setUiSettings } = useUiSettingsStore();

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
        <div className="bg-fg-1 border-stroke rounded-6 flex h-[110%] flex-col gap-6 border p-12">
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

                <Select
                    value={currentLanguage}
                    onValueChange={handleLanguageChange}
                >
                    <SelectTriggerButton
                        label={currentLanguageName}
                        className="min-w-[120px]"
                    />
                    <SelectContent>
                        {languages.map((language) => (
                            <SelectItem
                                key={language.code}
                                value={language.code}
                            >
                                {language.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="flex h-[2.5rem] items-center justify-between px-8">
                <p className="text-body text-text-subtitle">
                    <T keyName="settings.general.showFullDatabasePath" />
                </p>
                <Switch
                    checked={uiSettings.showFullDatabasePath}
                    onCheckedChange={(checked) =>
                        setUiSettings({
                            ...uiSettings,
                            showFullDatabasePath: checked,
                        })
                    }
                />
            </div>
        </div>
    );
}
