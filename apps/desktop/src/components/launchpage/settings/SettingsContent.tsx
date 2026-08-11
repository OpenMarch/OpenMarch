import MouseSettings from "./MouseSettings";
import GeneralSettings from "./GeneralSettings";
import PluginsContents from "./plugins/Plugins";
import PrivacySettings from "./PrivacySettings";
import DeveloperSettings from "./DeveloperSettings";
import DatabaseRepairSettings from "./DatabaseRepairSettings";
import { T } from "@tolgee/react";

export default function SettingsContent() {
    return (
        <section className="flex h-fit w-full max-w-[512px] flex-col gap-24">
            <div className="space-y-16">
                <h5 className="text-h5 leading-none">
                    <T keyName="settings.general" />
                </h5>
                <GeneralSettings />
            </div>
            <div className="space-y-16">
                <h5 className="text-h5 leading-none">
                    <T keyName="settings.mouse" />
                </h5>
                <MouseSettings />
            </div>
            <div className="space-y-16">
                <h5 className="text-h5">
                    <T keyName="settings.plugins" />
                </h5>
                <PluginsContents />
            </div>
            <div className="space-y-16">
                <h5 className="text-h5">
                    <T keyName="settings.privacy" />
                </h5>
                <PrivacySettings />
            </div>
            <div className="space-y-16">
                <h5 className="text-h5">
                    <T keyName="settings.developer" />
                </h5>
                <DeveloperSettings />
            </div>
            <div className="space-y-16">
                <h5 className="text-h5">
                    <T keyName="settings.database" />
                </h5>
                <DatabaseRepairSettings />
            </div>
        </section>
    );
}
