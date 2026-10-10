import { useEffect, useState } from "react";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useShallow } from "zustand/react/shallow";
import { Switch, Slider } from "@openmarch/ui";
import { T, useTranslate } from "@tolgee/react";
import SettingRow from "@/settings/SettingRow";
import SettingsPanel from "@/settings/SettingsPanel";

export default function MouseSettings() {
    const setUiSettings = useUiSettingsStore((s) => s.setUiSettings);
    // Only the fields shown here; a change writes over the latest settings at that moment
    const uiSettings = useUiSettingsStore(
        useShallow((s) => ({
            mouseSettings: s.uiSettings.mouseSettings,
        })),
    );
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
        <SettingsPanel>
            {/* Zoom sensitivity */}
            <SettingRow
                label={<T keyName="settings.mouse.zoomSensitivity" />}
                htmlFor="zoomSensitivity"
            >
                <div className="flex items-center gap-12">
                    <div className="w-[clamp(140px,20vw,240px)] shrink-0">
                        <Slider
                            className="w-full"
                            id="zoomSensitivity"
                            min={0.5}
                            max={4.0}
                            step={0.1}
                            value={[zoomValue]}
                            onValueChange={([value]) => setZoomValue(value)}
                            onValueCommit={([value]) =>
                                setUiSettings({
                                    ...useUiSettingsStore.getState().uiSettings,
                                    mouseSettings: {
                                        ...uiSettings.mouseSettings,
                                        zoomSensitivity: value,
                                    },
                                })
                            }
                            aria-label={`${t("settings.mouse.zoomSensitivity")}`}
                        />
                    </div>
                    <div className="w-48 shrink-0 text-right">
                        <span className="text-body text-text tabular-nums">
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
                            ...useUiSettingsStore.getState().uiSettings,
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
                    <div className="flex items-center gap-12">
                        <div className="w-[clamp(140px,20vw,240px)] shrink-0">
                            <Slider
                                className="w-full"
                                id="trackpadPanSensitivity"
                                min={0.1}
                                max={3.0}
                                step={0.1}
                                value={[trackpadPanValue]}
                                onValueChange={([value]) =>
                                    setTrackpadPanValue(value)
                                }
                                onValueCommit={([value]) =>
                                    setUiSettings({
                                        ...useUiSettingsStore.getState()
                                            .uiSettings,
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
                        <div className="w-48 shrink-0 text-right">
                            <span className="text-body text-text tabular-nums">
                                {trackpadPanValue.toFixed(1)}x
                            </span>
                        </div>
                    </div>
                </SettingRow>
            )}
        </SettingsPanel>
    );
}
