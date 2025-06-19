import ThemeSwitcher from "./ThemeSwitcher";
import MouseSettings from "./MouseSettings";
import * as Tabs from "@radix-ui/react-tabs";

export default function SettingsContent() {
    return (
        <Tabs.Content
            value="settings"
            className="flex w-full flex-col items-center p-16"
        >
            <div className="border-stroke rounded-16 flex w-[50rem] flex-col gap-48 border p-32">
                <div className="flex flex-col gap-16">
                    <h4 className="text-h5 leading-none">General</h4>
                    <div className="flex flex-col gap-16 px-12">
                        <div className="flex w-full items-center justify-between gap-16">
                            <p className="text-body">Theme</p>
                            <ThemeSwitcher />
                        </div>
                    </div>
                </div>
                <MouseSettings />
            </div>
        </Tabs.Content>
    );
}
