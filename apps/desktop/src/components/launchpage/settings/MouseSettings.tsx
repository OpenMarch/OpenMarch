import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { Switch, Slider } from "@openmarch/ui";
import { T, useTranslate } from "@tolgee/react";

export default function MouseSettings() {
    const { uiSettings, setUiSettings } = useUiSettingsStore();
    const { t } = useTranslate();

    return (
        <div className="bg-fg-1 border-stroke rounded-6 flex flex-col gap-6 border p-12">
            <div className="flex h-[2.5rem] items-center justify-between px-8">
                <label
                    htmlFor="zoomSensitivity"
                    className="text-body text-text-subtitle"
                >
                    <T keyName="settings.mouse.zoomSensitivity" />
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
                        aria-label={`${t("settings.mouse.zoomSensitivity")}`}
                    />
                </div>
            </div>
            <div className="flex h-[2.5rem] items-center justify-between px-8">
                <label
                    htmlFor="panSensitivity"
                    className="text-body text-text-subtitle"
                >
                    <T keyName="settings.mouse.panSensitivity" />
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
                        aria-label={`${t("settings.mouse.panSensitivity")}`}
                    />
                </div>
            </div>
            <div className="flex h-[2.5rem] items-center justify-between px-8">
                <label
                    htmlFor="trackpadPanSensitivity"
                    className="text-body text-text-subtitle"
                >
                    <T keyName="settings.mouse.trackpadPanSensitivity" />
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
                        aria-label={`${t("settings.mouse.trackpadPanSensitivity")}`}
                    />
                </div>
            </div>
            <div className="flex h-[2.5rem] items-center justify-between px-8">
                <label
                    htmlFor="trackpadMode"
                    className="text-body text-text-subtitle"
                >
                    <T keyName="settings.mouse.trackpadMode" />
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
