import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { Switch, Slider } from "@openmarch/ui";

export default function MouseSettings() {
    const { uiSettings, setUiSettings } = useUiSettingsStore();

    return (
        <div className="bg-fg-1 border-stroke rounded-6 flex flex-col gap-6 border p-12">
            <div className="flex h-[2.5rem] items-center justify-between px-8">
                <label
                    htmlFor="zoomSensitivity"
                    className="text-body text-text-subtitle"
                >
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
            <div className="flex h-[2.5rem] items-center justify-between px-8">
                <label
                    htmlFor="panSensitivity"
                    className="text-body text-text-subtitle"
                >
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
            <div className="flex h-[2.5rem] items-center justify-between px-8">
                <label
                    htmlFor="trackpadPanSensitivity"
                    className="text-body text-text-subtitle"
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
            <div className="flex h-[2.5rem] items-center justify-between px-8">
                <label
                    htmlFor="trackpadMode"
                    className="text-body text-text-subtitle"
                >
                    Trackpad mode (recommended for macOS)
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
    );
}
