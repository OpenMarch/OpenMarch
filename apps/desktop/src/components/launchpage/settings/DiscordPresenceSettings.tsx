import { Switch } from "@openmarch/ui";
import { T } from "@tolgee/react";
import { useEffect, useState } from "react";
import SettingRow from "@/settings/SettingRow";
import SettingsPanel from "@/settings/SettingsPanel";
import {
    DISCORD_PRESENCE_SETTING,
    DISCORD_SHOW_NAME_SETTING,
    discordPresenceEnabled,
    discordShowNameEnabled,
} from "@/discord/discordPresenceSettings";

/**
 * Settings > Privacy: whether the person's Discord status shows OpenMarch, and whether it also
 * names the open show (off unless they turn it on). Desktop only.
 */
export default function DiscordPresenceSettings() {
    const [enabled, setEnabled] = useState(true);
    const [showName, setShowName] = useState(false);

    useEffect(() => {
        let isMounted = true;
        void Promise.all([
            window.electron.invoke("settings:get", DISCORD_PRESENCE_SETTING),
            window.electron.invoke("settings:get", DISCORD_SHOW_NAME_SETTING),
        ]).then(([savedEnabled, savedShowName]: unknown[]) => {
            if (!isMounted) return;
            setEnabled(discordPresenceEnabled(savedEnabled));
            setShowName(discordShowNameEnabled(savedShowName));
        });
        return () => {
            isMounted = false;
        };
    }, []);

    return (
        <SettingsPanel heading={<T keyName="settings.privacy.discord" />}>
            <SettingRow
                label={<T keyName="settings.privacy.discord.toggle" />}
                description={<T keyName="settings.privacy.discord.about" />}
                htmlFor="discord-presence"
            >
                <Switch
                    id="discord-presence"
                    checked={enabled}
                    onCheckedChange={(checked) => {
                        setEnabled(checked);
                        window.electron.send("settings:set", {
                            [DISCORD_PRESENCE_SETTING]: checked,
                        });
                    }}
                />
            </SettingRow>
            {/* Only means something while the status is on; greyed out with the reason otherwise */}
            <SettingRow
                label={<T keyName="settings.privacy.discord.showName" />}
                description={
                    enabled ? (
                        <T keyName="settings.privacy.discord.showName.description" />
                    ) : (
                        <T keyName="settings.privacy.discord.showName.needsStatus" />
                    )
                }
                htmlFor="discord-presence-show-name"
            >
                <Switch
                    id="discord-presence-show-name"
                    checked={enabled && showName}
                    disabled={!enabled}
                    onCheckedChange={(checked) => {
                        setShowName(checked);
                        window.electron.send("settings:set", {
                            [DISCORD_SHOW_NAME_SETTING]: checked,
                        });
                    }}
                />
            </SettingRow>
        </SettingsPanel>
    );
}
