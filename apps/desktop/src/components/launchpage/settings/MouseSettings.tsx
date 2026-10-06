import { useEffect, useState } from "react";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { Switch, Slider } from "@openmarch/ui";
import { T, useTranslate } from "@tolgee/react";
import SettingRow from "@/settings/SettingRow";

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
        <div className="divide-stroke flex flex-col divide-y">
            {/* Zoom sensitivity */}
            <SettingRow
                label={<T keyName="settings.mouse.zoomSensitivity" />}
                htmlFor="zoomSensitivity"
            >
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
            </SettingRow>

            {/* Trackpad mode toggle */}
            <SettingRow
                label={<T keyName="settings.mouse.trackpadMode" />}
                htmlFor="trackpadMode"
            >
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
            </SettingRow>

            {/* Trackpad-specific sensitivities */}
            {uiSettings.mouseSettings.trackpadMode && (
                <SettingRow
                    label={
                        <T keyName="settings.mouse.trackpadPanSensitivity" />
                    }
                    htmlFor="trackpadPanSensitivity"
                >
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
                </SettingRow>
            )}
        </div>
    );
}
