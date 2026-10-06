import { useTolgee, T } from "@tolgee/react";
import { useState, useEffect } from "react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTriggerButton,
} from "@openmarch/ui";
import SettingRow from "@/settings/SettingRow";
import SettingsPanel from "@/settings/SettingsPanel";

const languages = [
    { code: "en", name: "English" },
    { code: "es", name: "Español" },
    { code: "fr", name: "Français" },
    { code: "pt-BR", name: "Português (Brasil)" },
    { code: "ja", name: "日本語" },
];

export default function GeneralSettings() {
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
        <SettingsPanel>
            <SettingRow
                label={<T keyName="settings.general.language" />}
                htmlFor="language"
            >
                <Select
                    value={currentLanguage}
                    onValueChange={handleLanguageChange}
                >
                    <SelectTriggerButton
                        id="language"
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
            </SettingRow>
        </SettingsPanel>
    );
}
