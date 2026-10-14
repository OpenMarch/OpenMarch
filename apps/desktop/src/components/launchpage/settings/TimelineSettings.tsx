import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { T } from "@tolgee/react";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import {
    WAVEFORM_STYLES,
    type WaveformStyle,
} from "@/timeline/timelineWaveform";
import SettingRow from "@/settings/SettingRow";
import SettingsPanel from "@/settings/SettingsPanel";
import WaveformStylePreview from "./WaveformStylePreview";

export default function TimelineSettings() {
    const { uiSettings, setUiSettings } = useUiSettingsStore();

    return (
        <SettingsPanel>
            <SettingRow
                label={<T keyName="settings.timeline.waveformStyle" />}
                htmlFor="waveform-style"
                stacked
                description={
                    <T
                        keyName={`settings.timeline.waveformStyle.${uiSettings.timelineWaveformStyle}.description`}
                    />
                }
            >
                <ToggleGroup.Root
                    id="waveform-style"
                    type="single"
                    value={uiSettings.timelineWaveformStyle}
                    onValueChange={(style) => {
                        if (!style) return;
                        setUiSettings({
                            ...uiSettings,
                            timelineWaveformStyle: style as WaveformStyle,
                        });
                    }}
                    className="flex h-fit w-fit flex-wrap gap-8"
                >
                    {WAVEFORM_STYLES.map((style) => (
                        <ToggleGroup.Item
                            key={style}
                            value={style}
                            className="group text-text bg-fg-2 text-body border-stroke data-[state=on]:border-accent rounded-6 flex flex-col items-start gap-8 border p-12 outline-hidden duration-150 ease-out focus-visible:-translate-y-4"
                        >
                            <span className="text-text-subtitle group-data-[state=on]:text-accent">
                                <WaveformStylePreview style={style} />
                            </span>
                            <T
                                keyName={`settings.timeline.waveformStyle.${style}`}
                            />
                        </ToggleGroup.Item>
                    ))}
                </ToggleGroup.Root>
            </SettingRow>
        </SettingsPanel>
    );
}
