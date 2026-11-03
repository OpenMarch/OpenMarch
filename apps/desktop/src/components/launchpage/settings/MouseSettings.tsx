import { useEffect, useState } from "react";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useShallow } from "zustand/react/shallow";
import { Switch, Slider } from "@openmarch/ui";
import { T, useTolgee, useTranslate } from "@tolgee/react";
import SettingRow from "@/settings/SettingRow";
import SettingsPanel from "@/settings/SettingsPanel";
import { formatLocale } from "@/utilities/formatLocale";

export default function MouseSettings() {
    const setUiSettings = useUiSettingsStore((s) => s.setUiSettings);
    // Only the fields shown here; a change writes over the latest settings at that moment
    const uiSettings = useUiSettingsStore(
        useShallow((s) => ({
            mouseSettings: s.uiSettings.mouseSettings,
        })),
    );
    const { t } = useTranslate();
    const language = formatLocale(useTolgee(["language"]).getLanguage());
    /** A sensitivity as a multiplier, e.g. "1.5x", with the language's decimal mark */
    const multiplier = (value: number) =>
        t("settings.mouse.multiplier", {
            value: value.toLocaleString(language, {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
            }),
        });
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
                            {multiplier(zoomValue)}
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
                                {multiplier(trackpadPanValue)}
                            </span>
                        </div>
                    </div>
                </SettingRow>
            )}
        </SettingsPanel>
    );
}
