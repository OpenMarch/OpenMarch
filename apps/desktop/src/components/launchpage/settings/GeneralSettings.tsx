import { useTolgee, T } from "@tolgee/react";
import { useState, useEffect } from "react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTriggerButton,
    Switch,
} from "@openmarch/ui";
import { VIEW3D_AUTO_OPEN_SETTING } from "@/view3d/sync/protocol";
import { isWebBuild } from "@/utilities/webBuild";
import SettingRow from "@/settings/SettingRow";
import SettingsPanel from "@/settings/SettingsPanel";
import { APP_LANGUAGES } from "@/utilities/languages";
import TranslationHelpNote from "@/components/i18n/TranslationHelpNote";
import UpdateSettingsRow from "@/updates/UpdateSettingsRow";

export default function GeneralSettings() {
    const tolgee = useTolgee(["language"]);
    const [currentLanguage, setCurrentLanguage] = useState("en");
    const [automaticUpdatesEnabled, setAutomaticUpdatesEnabled] =
        useState(true);
    const [view3dAutoOpen, setView3dAutoOpen] = useState(false);

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

    useEffect(() => {
        let isMounted = true;
        const loadAutomaticUpdatesSetting = async () => {
            const savedValue = await window.electron.invoke(
                "settings:get",
                "automaticUpdates",
            );
            if (isMounted) setAutomaticUpdatesEnabled(savedValue !== false);
        };
        void loadAutomaticUpdatesSetting();
        // Never answered opens it too (the 3D View asks), so only an explicit off reads as off
        void window.electron
            .invoke("settings:get", VIEW3D_AUTO_OPEN_SETTING)
            .then((savedValue: unknown) => {
                if (isMounted) setView3dAutoOpen(savedValue !== false);
            });
        // The 3D View's answer, given while this is open
        const unsubscribe = window.electron.onSettingsChanged?.((change) => {
            if (VIEW3D_AUTO_OPEN_SETTING in change)
                setView3dAutoOpen(change[VIEW3D_AUTO_OPEN_SETTING] !== false);
        });
        return () => {
            isMounted = false;
            unsubscribe?.();
        };
    }, []);

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
        APP_LANGUAGES.find((lang) => lang.code === currentLanguage)?.name ||
        "English";

    return (
        <SettingsPanel>
            <SettingRow
                label={<T keyName="settings.general.language" />}
                htmlFor="language"
                description={<TranslationHelpNote language={currentLanguage} />}
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
                        {APP_LANGUAGES.map((language) => (
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

            {/* The web editor is always the latest version: nothing to install */}
            {!isWebBuild && <UpdateSettingsRow />}
            {!isWebBuild && (
                <SettingRow
                    label={<T keyName="settings.general.automaticDownload" />}
                    description={
                        <T keyName="settings.general.automaticDownload.description" />
                    }
                    htmlFor="automatic-updates"
                >
                    <Switch
                        id="automatic-updates"
                        checked={automaticUpdatesEnabled}
                        onCheckedChange={(checked) => {
                            setAutomaticUpdatesEnabled(checked);
                            window.electron.send("settings:set", {
                                automaticUpdates: checked,
                            });
                        }}
                    />
                </SettingRow>
            )}

            {/* A browser blocks a window opened without a click. */}
            {!isWebBuild && (
                <SettingRow
                    label={<T keyName="settings.general.openView3dWithShow" />}
                    htmlFor="view3d-auto-open"
                >
                    <Switch
                        id="view3d-auto-open"
                        checked={view3dAutoOpen}
                        data-testid="settings-view3d-auto-open"
                        onCheckedChange={(checked) => {
                            setView3dAutoOpen(checked);
                            window.electron.send("settings:set", {
                                [VIEW3D_AUTO_OPEN_SETTING]: checked,
                            });
                        }}
                    />
                </SettingRow>
            )}
        </SettingsPanel>
    );
}
