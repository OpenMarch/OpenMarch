import { T } from "@tolgee/react";
import { Switch } from "@openmarch/ui";
import {
    useUiSettingsStore,
    type MarcherLabelSize,
    type UiSettings,
} from "@/stores/UiSettingsStore";
import SettingRow from "@/settings/SettingRow";
import SettingsPanel from "@/settings/SettingsPanel";
import SettingChoices from "@/settings/SettingChoices";

const LABEL_SIZES: readonly MarcherLabelSize[] = ["small", "normal", "large"];
const LABEL_POSITIONS = ["above", "beside"] as const;

/**
 * How the field looks, set once rather than flipped while working (#418). The
 * View tab keeps the working toggles. Saved in the UI settings, which the main
 * window follows as they change.
 */
export default function FieldSettings() {
    const uiSettings = useUiSettingsStore((s) => s.uiSettings);
    const setUiSettings = useUiSettingsStore((s) => s.setUiSettings);
    const change = (patch: Partial<UiSettings>) =>
        setUiSettings({
            ...useUiSettingsStore.getState().uiSettings,
            ...patch,
        });

    return (
        <SettingsPanel>
            <SettingRow
                label={<T keyName="settings.field.gridLines" />}
                htmlFor="field-grid-lines"
            >
                <Switch
                    id="field-grid-lines"
                    checked={uiSettings.gridLines}
                    onCheckedChange={(gridLines) => change({ gridLines })}
                />
            </SettingRow>

            <SettingRow
                label={<T keyName="settings.field.halfLines" />}
                htmlFor="field-half-lines"
            >
                <Switch
                    id="field-half-lines"
                    checked={uiSettings.halfLines}
                    onCheckedChange={(halfLines) => change({ halfLines })}
                />
            </SettingRow>

            <SettingRow
                label={<T keyName="settings.field.labelSize" />}
                htmlFor="field-label-size"
            >
                <SettingChoices
                    id="field-label-size"
                    value={uiSettings.marcherLabelSize ?? "normal"}
                    options={LABEL_SIZES}
                    keyPrefix="settings.field.labelSize"
                    onChange={(marcherLabelSize) =>
                        change({ marcherLabelSize })
                    }
                />
            </SettingRow>

            <SettingRow
                label={<T keyName="settings.field.labelPosition" />}
                htmlFor="field-label-position"
            >
                <SettingChoices
                    id="field-label-position"
                    value={uiSettings.marcherLabelPosition ?? "above"}
                    options={LABEL_POSITIONS}
                    keyPrefix="settings.field.labelPosition"
                    onChange={(marcherLabelPosition) =>
                        change({ marcherLabelPosition })
                    }
                />
            </SettingRow>

            <SettingRow
                label={<T keyName="settings.field.stepSizeWarnings" />}
                htmlFor="field-step-size-warnings"
                description={
                    <T keyName="settings.field.stepSizeWarnings.description" />
                }
            >
                <Switch
                    id="field-step-size-warnings"
                    checked={uiSettings.stepSizeWarnings}
                    onCheckedChange={(stepSizeWarnings) =>
                        change({ stepSizeWarnings })
                    }
                />
            </SettingRow>
        </SettingsPanel>
    );
}
