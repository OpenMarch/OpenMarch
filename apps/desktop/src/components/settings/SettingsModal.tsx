import ThemeSwitcher from "../titlebar/ThemeSwitcher";
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogTrigger,
} from "@openmarch/ui";
import { GearSixIcon } from "@phosphor-icons/react";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { Switch } from "@openmarch/ui";

export default function SettingsModal() {
    const { uiSettings, setUiSettings } = useUiSettingsStore();

    return (
        <Dialog>
            <DialogTrigger
                asChild
                className="titlebar-button hover:text-accent flex cursor-pointer items-center gap-6 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:pointer-events-none disabled:opacity-50"
            >
                <GearSixIcon size={18} />
            </DialogTrigger>
            <DialogContent className="w-[10rem]" aria-describedby="Settings">
                <DialogTitle>Settings</DialogTitle>
                <div className="flex flex-col gap-48">
                    <div className="flex flex-col gap-16">
                        <div className="flex w-full items-center justify-between gap-16">
                            <p className="text-body">Theme</p>
                            <ThemeSwitcher />
                        </div>
                        <div className="flex w-full items-center justify-between gap-16">
                            <p className="text-body">Show waveform</p>
                            <Switch
                                id="waveform"
                                checked={uiSettings.showWaveform}
                                onCheckedChange={(checked) =>
                                    setUiSettings({
                                        ...uiSettings,
                                        showWaveform: checked,
                                    })
                                }
                            />
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
