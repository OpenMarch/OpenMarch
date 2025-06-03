import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { Switch, Slider } from "@openmarch/ui";

export default function MouseSettings() {
    const { uiSettings, setUiSettings } = useUiSettingsStore();

    return (
        <div className="flex flex-col gap-16">
            <h4 className="text-h5 leading-none">Mouse & Trackpad Settings</h4>
            <div className="flex flex-col gap-16 px-12">
                <div className="flex w-full items-center justify-between gap-16">
                    <label htmlFor="zoomSensitivity" className="text-body">
                        Zoom sensitivity
                    </label>
                    <div className="w-[200px]">
                        <Slider
                            min={0.5}
                            max={4.0}
                            step={0.1}
                            value={[uiSettings.mouseSettings.zoomSensitivity]}
                            onValueChange={([value]) =>
                                setUiSettings({
                                    ...uiSettings,
                                    mouseSettings: {
                                        ...uiSettings.mouseSettings,
                                        zoomSensitivity: value,
                                    },
                                })
                            }
                            aria-label="Zoom sensitivity"
                        />
                    </div>
                </div>
                <div className="flex w-full items-center justify-between gap-16">
                    <label htmlFor="panSensitivity" className="text-body">
                        Pan sensitivity
                    </label>
                    <div className="w-[200px]">
                        <Slider
                            min={0.1}
                            max={3.0}
                            step={0.1}
                            value={[uiSettings.mouseSettings.panSensitivity]}
                            onValueChange={([value]) =>
                                setUiSettings({
                                    ...uiSettings,
                                    mouseSettings: {
                                        ...uiSettings.mouseSettings,
                                        panSensitivity: value,
                                    },
                                })
                            }
                            aria-label="Pan sensitivity"
                        />
                    </div>
                </div>
                <div className="flex w-full items-center justify-between gap-16">
                    <label
                        htmlFor="trackpadPanSensitivity"
                        className="text-body"
                    >
                        Trackpad pan sensitivity
                    </label>
                    <div className="w-[200px]">
                        <Slider
                            min={0.1}
                            max={3.0}
                            step={0.1}
                            value={[
                                uiSettings.mouseSettings.trackpadPanSensitivity,
                            ]}
                            onValueChange={([value]) =>
                                setUiSettings({
                                    ...uiSettings,
                                    mouseSettings: {
                                        ...uiSettings.mouseSettings,
                                        trackpadPanSensitivity: value,
                                    },
                                })
                            }
                            aria-label="Trackpad pan sensitivity"
                        />
                    </div>
                </div>
                <div className="flex w-full items-center justify-between gap-16">
                    <label htmlFor="trackpadMode" className="text-body">
                        Enable trackpad mode (recommended for macOS users)
                    </label>
                    <Switch
                        id="trackpadMode"
                        checked={uiSettings.mouseSettings.trackpadMode}
                        onCheckedChange={(checked) =>
                            setUiSettings({
                                ...uiSettings,
                                mouseSettings: {
                                    ...uiSettings.mouseSettings,
                                    trackpadMode: checked,
                                },
                            })
                        }
                    />
                </div>
            </div>
        </div>
    );
}
