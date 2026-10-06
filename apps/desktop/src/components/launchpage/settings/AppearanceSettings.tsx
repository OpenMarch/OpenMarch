import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { SunIcon, MoonIcon } from "@phosphor-icons/react";
import { T } from "@tolgee/react";
import { Switch } from "@openmarch/ui";
import { useTheme } from "@/context/ThemeContext";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import SettingRow from "@/settings/SettingRow";
import SettingsPanel from "@/settings/SettingsPanel";

export default function AppearanceSettings() {
    const { theme, setTheme } = useTheme();
    const { uiSettings, setUiSettings } = useUiSettingsStore();

    return (
        <SettingsPanel>
            <SettingRow
                label={<T keyName="settings.general.appearance" />}
                htmlFor="theme"
            >
                <ToggleGroup.Root
                    id="theme"
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
            </SettingRow>

            <SettingRow
                label={<T keyName="settings.general.showFullDatabasePath" />}
                htmlFor="show-full-file-path"
                description={
                    <T keyName="settings.general.showFullDatabasePath.description" />
                }
            >
                <Switch
                    id="show-full-file-path"
                    checked={uiSettings.showFullDatabasePath}
                    onCheckedChange={(checked) =>
                        setUiSettings({
                            ...uiSettings,
                            showFullDatabasePath: checked,
                        })
                    }
                />
            </SettingRow>
        </SettingsPanel>
    );
}
