import { Collapsible } from "@/components/ui/Collapsible";
import { Input, Switch } from "@openmarch/ui";
import { T, useTranslate } from "@tolgee/react";
import { GearIcon } from "@phosphor-icons/react";
import React, { useEffect } from "react";
import tolgee from "@/global/singletons/Tolgee";
import { InContextTools } from "@tolgee/web/tools";

export default function DeveloperSettings() {
    const { t } = useTranslate();
    const [tolgeeDevTools, setTolgeeDevTools] = React.useState<boolean>(false);
    const [tolgeeApiKey, setTolgeeApiKey] = React.useState<string>("");
    const [showRefreshNotice, setShowRefreshNotice] =
        React.useState<boolean>(false);

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
            {showRefreshNotice && (
                <div className="bg-fg-1 rounded-6 text-body border-yellow flex w-full items-center gap-8 border px-12 py-8">
                    <GearIcon size={20} />
                    <p>
                        <T
                            keyName="settings.developer.refreshNotice"
                            params={{
                                a: (content) => (
                                    <strong
                                        className="cursor-pointer"
                                        onClick={() => {
                                            window.location.reload();
                                        }}
                                    >
                                        {content}
                                    </strong>
                                ),
                            }}
                        />
                    </p>
                </div>
            )}
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
                                setShowRefreshNotice(true);
                                if (checked) {
                                    tolgee.updateOptions({
                                        apiKey: tolgeeApiKey,
                                    });
                                    tolgee.addPlugin(InContextTools());
                                    setShowRefreshNotice(false);
                                } else {
                                    setShowRefreshNotice(true);
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
