import { Collapsible } from "@/components/ui/Collapsible";
import { Input, Switch } from "@openmarch/ui";
import { T, useTranslate } from "@tolgee/react";
import React, { useEffect } from "react";
import tolgee from "@/global/singletons/Tolgee";
import { InContextTools } from "@tolgee/web/tools";
import { RemoveInContextTools } from "@/global/singletons/Tolgee";

/**
 * Render the Developer Settings panel for configuring Tolgee developer tools.
 *
 * Shows a toggle to enable or disable Tolgee In-Context Tools (persisted via Electron settings).
 * When enabled, displays an input to set the Tolgee API key (persisted and applied to Tolgee options).
 * Toggling the switch updates persisted settings and adds either the InContextTools plugin or the RemoveInContextTools plugin,
 * and updating the API key updates Tolgee's configuration.
 *
 * @returns The React element containing the developer settings UI
 */
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
        <div className="bg-fg-1 border-stroke rounded-6 flex flex-col gap-16 border p-12">
            <Collapsible
                trigger={
                    <p className="flex flex-col gap-16 px-8">
                        <T keyName="settings.developer" />
                    </p>
                }
                className="flex flex-col gap-16 pt-16"
            >
                <div className="flex flex-col gap-16 px-12">
                    <div className="flex w-full items-center justify-between gap-16">
                        <p className="text-body">
                            <T keyName="settings.tolgeeDevToolsToggle" />
                        </p>
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
                    </div>

                    {tolgeeDevTools && (
                        <Input
                            type="text"
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
        </div>
    );
}