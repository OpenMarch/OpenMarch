import { useEffect, useState } from "react";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { Switch, Slider } from "@openmarch/ui";
import { T, useTranslate } from "@tolgee/react";

export default function MouseSettings() {
    const { uiSettings, setUiSettings } = useUiSettingsStore();
    const { t } = useTranslate();
    const [zoomValue, setZoomValue] = useState(
        uiSettings.mouseSettings.zoomSensitivity,
    );
    const [trackpadPanValue, setTrackpadPanValue] = useState(
        uiSettings.mouseSettings.trackpadPanSensitivity,
    );

    // Keep local state in sync if settings change elsewhere
    useEffect(() => {
        setZoomValue(uiSettings.mouseSettings.zoomSensitivity);
    }, [uiSettings.mouseSettings.zoomSensitivity]);

    useEffect(() => {
        setTrackpadPanValue(uiSettings.mouseSettings.trackpadPanSensitivity);
    }, [uiSettings.mouseSettings.trackpadPanSensitivity]);

    return (
        <div className="bg-fg-1 border-stroke rounded-6 flex flex-col gap-6 border p-12">
            {/* Zoom sensitivity */}
            <div className="flex h-[2.5rem] items-center justify-between px-8">
                <label
                    htmlFor="zoomSensitivity"
                    className="text-body text-text-subtitle"
                >
                    <T keyName="settings.mouse.zoomSensitivity" />
                </label>
                <div className="flex items-center gap-3">
                    <div className="w-[200px] shrink-0">
                        <Slider
                            min={0.5}
                            max={4.0}
                            step={0.1}
                            value={[zoomValue]}
                            onValueChange={([value]) => setZoomValue(value)}
                            onValueCommit={([value]) =>
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
                    <div className="w-14 shrink-0 text-right">
                        <span className="text-body text-text font-mono tabular-nums">
                            {zoomValue.toFixed(1)}x
                        </span>
                    </div>
                </div>
            </div>

            {/* Trackpad mode toggle */}
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

            {/* Trackpad-specific sensitivities */}
            {uiSettings.mouseSettings.trackpadMode && (
                <div className="flex h-[2.5rem] items-center justify-between px-8">
                    <label
                        htmlFor="trackpadPanSensitivity"
                        className="text-body text-text-subtitle"
                    >
                        <T keyName="settings.mouse.trackpadPanSensitivity" />
                    </label>
                    <div className="flex items-center gap-3">
                        <div className="w-[200px] shrink-0">
                            <Slider
                                min={0.1}
                                max={3.0}
                                step={0.1}
                                value={[trackpadPanValue]}
                                onValueChange={([value]) =>
                                    setTrackpadPanValue(value)
                                }
                                onValueCommit={([value]) =>
                                    setUiSettings({
                                        ...uiSettings,
                                        mouseSettings: {
                                            ...uiSettings.mouseSettings,
                                            trackpadPanSensitivity: value,
                                        },
                                    })
                                }
                                aria-label={`${t(
                                    "settings.mouse.trackpadPanSensitivity",
                                )}`}
                            />
                        </div>
                        <div className="w-14 shrink-0 text-right">
                            <span className="text-body text-text font-mono tabular-nums">
                                {trackpadPanValue.toFixed(1)}x
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
