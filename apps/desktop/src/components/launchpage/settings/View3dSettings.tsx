import { useEffect, useState } from "react";
import { T } from "@tolgee/react";
import SettingRow from "@/settings/SettingRow";
import SettingsPanel from "@/settings/SettingsPanel";
import Choices from "@/settings/SettingChoices";
import {
    QUALITY_MODES,
    loadQualityMode,
    saveQualityMode,
} from "@/view3d/window/qualityPreference";
import {
    RESOLUTIONS,
    loadResolution,
    saveResolution,
} from "@/view3d/window/renderPrefs";
import {
    CONTROL_SCHEME_STORAGE_KEY,
    loadControlScheme,
    saveControlScheme,
} from "@/view3d/window/camera/controlScheme";
import ControlSchemePicker from "@/view3d/window/camera/ControlSchemePicker";

/**
 * How the 3D View draws and moves on this computer. Quality and resolution are here only (the 3D window's
 * own panel offers them just in the web preview, which has no Settings window); the controls are in that panel too. Each choice is saved in local
 * storage, which the 3D window shares and listens to, so an open 3D View
 * follows a change at once. These modules are plain TypeScript: nothing here
 * loads three.js.
 */
export default function View3dSettings() {
    const [quality, setQuality] = useState(() => loadQualityMode());
    const [resolution, setResolution] = useState(() => loadResolution());
    const [controls, setControls] = useState(() => loadControlScheme());

    // The 3D window's own panel can change the controls while this is open.
    useEffect(() => {
        const onStorage = (event: StorageEvent) => {
            if (event.key === null || event.key === CONTROL_SCHEME_STORAGE_KEY)
                setControls(loadControlScheme());
        };
        window.addEventListener("storage", onStorage);
        return () => window.removeEventListener("storage", onStorage);
    }, []);

    return (
        <SettingsPanel>
            <SettingRow
                label={<T keyName="settings.view3d.controls" />}
                htmlFor="view3d-controls"
                stacked
                description={
                    <T
                        keyName={`settings.view3d.controls.${controls}.description`}
                    />
                }
            >
                <ControlSchemePicker
                    id="view3d-controls"
                    value={controls}
                    onChange={(scheme) => {
                        saveControlScheme(scheme);
                        setControls(scheme);
                    }}
                />
            </SettingRow>

            <SettingRow
                label={<T keyName="settings.view3d.quality" />}
                htmlFor="view3d-quality"
                stacked
                description={
                    <T
                        keyName={`settings.view3d.quality.${quality}.description`}
                    />
                }
            >
                <Choices
                    id="view3d-quality"
                    value={quality}
                    options={QUALITY_MODES}
                    keyPrefix="settings.view3d.quality"
                    onChange={(mode) => {
                        saveQualityMode(mode);
                        setQuality(mode);
                    }}
                />
            </SettingRow>

            <SettingRow
                label={<T keyName="settings.view3d.resolution" />}
                htmlFor="view3d-resolution"
                stacked
                description={
                    <T
                        keyName={`settings.view3d.resolution.${resolution}.description`}
                    />
                }
            >
                <Choices
                    id="view3d-resolution"
                    value={resolution}
                    options={RESOLUTIONS}
                    keyPrefix="settings.view3d.resolution"
                    onChange={(value) => {
                        saveResolution(value);
                        setResolution(value);
                    }}
                />
            </SettingRow>
        </SettingsPanel>
    );
}
