import { Switch } from "@openmarch/ui";
import { T } from "@tolgee/react";
import { useEffect, useState } from "react";
import SettingRow from "@/settings/SettingRow";
import SettingsPanel from "@/settings/SettingsPanel";
import {
    DISCORD_PRESENCE_SETTING,
    discordPresenceEnabled,
} from "@/discord/discordPresenceSettings";

/** Settings > Privacy: whether the person's Discord status shows OpenMarch. Desktop only. */
export default function DiscordPresenceSettings() {
    const [enabled, setEnabled] = useState(true);

    useEffect(() => {
        let isMounted = true;
        void window.electron
            .invoke("settings:get", DISCORD_PRESENCE_SETTING)
            .then((saved: unknown) => {
                if (isMounted) setEnabled(discordPresenceEnabled(saved));
            });
        return () => {
            isMounted = false;
        };
    }, []);

    return (
        <SettingsPanel heading={<T keyName="settings.privacy.discord" />}>
            <SettingRow
                label={<T keyName="settings.privacy.discord.toggle" />}
                description={
                    <T keyName="settings.privacy.discord.description" />
                }
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
        </SettingsPanel>
    );
}
