import MouseSettings from "./MouseSettings";
import * as Tabs from "@radix-ui/react-tabs";
import AppearanceSettings from "./AppearanceSettings";
import PluginsContents from "./plugins/Plugins";
import PrivacySettings from "./PrivacySettings";

export default function SettingsContent() {
    return (
        <Tabs.Content
            value="settings"
            className="flex w-full min-w-0 flex-col items-center overflow-y-auto p-6 select-text"
        >
            <div className="flex h-fit w-full max-w-[512px] flex-col gap-16">
                <h3 className="text-h3">Settings</h3>
                <h5 className="text-h5 leading-none">Appearance</h5>
                <AppearanceSettings />
                <h4 className="text-h5 leading-none">Mouse & trackpad</h4>
                <MouseSettings />
                <h3 className="text-h3">Plugins</h3>
                <PluginsContents />
                <h3 className="text-h3">Privacy</h3>
                <PrivacySettings />
            </div>
        </Tabs.Content>
    );
}
