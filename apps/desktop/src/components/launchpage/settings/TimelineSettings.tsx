import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { T } from "@tolgee/react";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import {
    WAVEFORM_STYLES,
    type WaveformStyle,
} from "@/timeline/timelineWaveform";
import EditorModeCards from "@/components/editorMode/EditorModeCards";
import { useEditorModeStore } from "@/stores/EditorModeStore";
import SettingRow from "@/settings/SettingRow";
import SettingsPanel from "@/settings/SettingsPanel";
import WaveformStylePreview from "./WaveformStylePreview";

/** Basic or Expert (UI-19): full width, since the cards need room. */
function EditorModeSetting() {
    const mode = useEditorModeStore((state) => state.mode);
    const setMode = useEditorModeStore((state) => state.setMode);
    return (
        <div className="flex flex-col gap-8 py-12">
            <span id="editor-mode-label" className="text-body text-text">
                <T keyName="settings.general.editorMode" />
            </span>
            <EditorModeCards
                value={mode}
                onChange={setMode}
                size="compact"
                id="settings"
                aria-labelledby="editor-mode-label"
            />
            <p className="text-sub text-text-subtitle">
                <T keyName="settings.general.editorMode.note" />
            </p>
        </div>
    );
}

export default function TimelineSettings() {
    const { uiSettings, setUiSettings } = useUiSettingsStore();

    return (
        <SettingsPanel>
            <EditorModeSetting />
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
