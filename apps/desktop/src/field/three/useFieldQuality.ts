import { useEffect } from "react";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import {
    fieldQuality,
    QUALITY_SETTINGS,
    useFieldQualityStore,
    type FieldQuality,
    type QualitySettings,
} from "@/field/fieldQuality";

export type CurrentFieldQuality = FieldQuality & { settings: QualitySettings };

const withSettings = (quality: FieldQuality): CurrentFieldQuality => ({
    ...quality,
    settings: QUALITY_SETTINGS[quality.mode],
});

const qualityNow = (): FieldQuality => {
    const { gl, gpuCrashed } = useFieldQualityStore.getState();
    return fieldQuality({
        performanceMode:
            useUiSettingsStore.getState().uiSettings.fieldPerformanceMode,
        gl: gl?.kind ?? null,
        gpuCrashed,
    });
};

/** The field's quality now, outside React: for the test API and the benchmark. */
export function currentFieldQuality(): CurrentFieldQuality {
    return withSettings(qualityNow());
}

/** What the field's quality mode changes, now: for frame hooks (allocates nothing). */
export function currentQualitySettings(): QualitySettings {
    return QUALITY_SETTINGS[qualityNow().mode];
}

/** The field's quality, re-rendering when the setting or the machine's state changes. */
export function useFieldQuality(): CurrentFieldQuality {
    const performanceMode = useUiSettingsStore(
        (s) => s.uiSettings.fieldPerformanceMode,
    );
    const gl = useFieldQualityStore((s) => s.gl?.kind ?? null);
    const gpuCrashed = useFieldQualityStore((s) => s.gpuCrashed);
    const quality = fieldQuality({ performanceMode, gl, gpuCrashed });
    return withSettings(quality);
}

/**
 * Follows the desktop app's GPU process (ADR 0005 D-3): asks once whether it
 * crashed earlier this session, then listens for a crash. The web build
 * always answers no.
 */
export function useGpuCrashWatch() {
    useEffect(() => {
        const electron = window.electron;
        if (!electron?.gpuCrashed) return;
        const crashed = () =>
            useFieldQualityStore.setState({ gpuCrashed: true });
        let active = true;
        electron
            .gpuCrashed()
            .then((gone) => {
                if (active && gone) crashed();
            })
            .catch(() => {
                // An older main process without the channel: nothing to follow
            });
        const unsubscribe = electron.onGpuCrashed(crashed);
        return () => {
            active = false;
            unsubscribe();
        };
    }, []);
}
