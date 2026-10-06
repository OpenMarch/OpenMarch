import { Collapsible } from "@/components/ui/Collapsible";
import { Input, Switch } from "@openmarch/ui";
import { T, useTranslate } from "@tolgee/react";
import React, { useEffect } from "react";
import tolgee from "@/global/singletons/Tolgee";
import { InContextTools } from "@tolgee/web/tools";
import { RemoveInContextTools } from "@/global/singletons/Tolgee";
import SettingRow from "@/settings/SettingRow";
import SettingsPanel from "@/settings/SettingsPanel";

export default function DeveloperSettings() {
    const { t } = useTranslate();
    const [tolgeeDevTools, setTolgeeDevTools] = React.useState<boolean>(false);
    const [tolgeeApiKey, setTolgeeApiKey] = React.useState<string>("");

    useEffect(() => {
        void window.electron
            .invoke("settings:get", "tolgeeApiKey")
            .then((tolgeeApiKey) => {
                if (tolgeeApiKey === undefined) {
                    setTolgeeApiKey("");
                } else {
                    setTolgeeApiKey(tolgeeApiKey);
                }
            });
        void window.electron
            .invoke("settings:get", "tolgeeDevTools")
            .then((tolgeeDevTools) => {
                if (tolgeeDevTools === undefined) {
                    setTolgeeDevTools(false);
                } else {
                    setTolgeeDevTools(tolgeeDevTools);
                }
            });
    }, []);

    return (
        <SettingsPanel>
            <Collapsible
                trigger={
                    <p className="text-body text-text py-12">
                        <T keyName="settings.developer" />
                    </p>
                }
                className="flex flex-col pb-12"
            >
                <div className="flex flex-col gap-8">
                    <SettingRow
                        label={<T keyName="settings.tolgeeDevToolsToggle" />}
                        htmlFor="tolgee-dev-tools"
                    >
                        <Switch
                            id="tolgee-dev-tools"
                            checked={tolgeeDevTools}
                            onCheckedChange={(checked) => {
                                setTolgeeDevTools(checked);
                                window.electron.send("settings:set", {
                                    tolgeeDevTools: checked,
                                });
                                if (checked) {
                                    tolgee.updateOptions({
                                        apiKey: tolgeeApiKey,
                                    });
                                    tolgee.addPlugin(InContextTools());
                                } else {
                                    tolgee.updateOptions({
                                        apiKey: undefined,
                                    });
                                    tolgee.addPlugin(RemoveInContextTools());
                                }
                            }}
                        />
                    </SettingRow>

                    {tolgeeDevTools && (
                        <Input
                            id="tolgee-api-key"
                            type="text"
                            aria-label={t("settings.tolgeeApiKeyPlaceholder")}
                            value={tolgeeApiKey}
                            placeholder={t("settings.tolgeeApiKeyPlaceholder")}
                            onChange={(e) => {
                                setTolgeeApiKey(e.target.value);
                                window.electron.send("settings:set", {
                                    tolgeeApiKey: e.target.value,
                                });
                                tolgee.updateOptions({
                                    apiKey: e.target.value,
                                });
                            }}
                            required
                            maxLength={64}
                        />
                    )}
                </div>
            </Collapsible>
        </SettingsPanel>
    );
}
