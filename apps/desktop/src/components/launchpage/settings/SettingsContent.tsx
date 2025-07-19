import MouseSettings from "./MouseSettings";
import GeneralSettings from "./GeneralSettings";
import PluginsContents from "./plugins/Plugins";
import PrivacySettings from "./PrivacySettings";
import { T } from "@tolgee/react";

export default function SettingsContent() {
    return (
        <div className="flex h-fit w-full max-w-[512px] flex-col gap-16">
            <h5 className="text-h5 leading-none">
                <T keyName="settings.general" />
            </h5>
            <GeneralSettings />
            <h4 className="text-h5 leading-none">
                <T keyName="settings.mouse" />
            </h4>
            <MouseSettings />
            <h3 className="text-h3">
                <T keyName="settings.plugins" />
            </h3>
            <PluginsContents />
            <h3 className="text-h3">
                <T keyName="settings.privacy" />
            </h3>
            <PrivacySettings />
        </div>
    );
}
