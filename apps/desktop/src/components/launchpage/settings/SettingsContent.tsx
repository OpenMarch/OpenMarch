import MouseSettings from "./MouseSettings";
import AppearanceSettings from "./AppearanceSettings";
import PluginsContents from "./plugins/Plugins";
import PrivacySettings from "./PrivacySettings";

export default function SettingsContent() {
    return (
        <div className="flex h-fit w-full max-w-[512px] flex-col gap-16">
            <h5 className="text-h5 leading-none">Appearance</h5>
            <AppearanceSettings />
            <h4 className="text-h5 leading-none">Mouse & trackpad</h4>
            <MouseSettings />
            <h3 className="text-h3">Plugins</h3>
            <PluginsContents />
            <h3 className="text-h3">Privacy</h3>
            <PrivacySettings />
        </div>
    );
}
