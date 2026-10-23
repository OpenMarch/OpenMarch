import * as ToggleGroup from "@radix-ui/react-toggle-group";
import {
    CursorIcon,
    HandPointingIcon,
    MagicWandIcon,
} from "@phosphor-icons/react";
import { T } from "@tolgee/react";
import {
    useInputModeStore,
    type InputModePreference,
} from "@/stores/InputModeStore";
import SettingRow from "@/settings/SettingRow";
import SettingsPanel from "@/settings/SettingsPanel";

const OPTIONS: {
    value: InputModePreference;
    labelKey: string;
    Icon: typeof CursorIcon;
}[] = [
    {
        value: "auto",
        labelKey: "settings.input.interface.auto",
        Icon: MagicWandIcon,
    },
    {
        value: "touch",
        labelKey: "settings.input.interface.touch",
        Icon: HandPointingIcon,
    },
    {
        value: "mouse",
        labelKey: "settings.input.interface.mouse",
        Icon: CursorIcon,
    },
];

/** Whether the interface is laid out for fingers or for a mouse. */
export default function InputSettings() {
    const preference = useInputModeStore((state) => state.preference);
    const setPreference = useInputModeStore((state) => state.setPreference);

    return (
        <SettingsPanel>
            <SettingRow
                label={<T keyName="settings.input.interface" />}
                htmlFor="input-interface"
                description={
                    <T keyName="settings.input.interface.description" />
                }
            >
                <ToggleGroup.Root
                    id="input-interface"
                    type="single"
                    value={preference}
                    onValueChange={(value) => {
                        if (value) setPreference(value as InputModePreference);
                    }}
                    className="flex h-fit w-fit flex-wrap gap-8"
                >
                    {OPTIONS.map(({ value, labelKey, Icon }) => (
                        <ToggleGroup.Item
                            key={value}
                            value={value}
                            className="text-text bg-fg-2 text-body border-stroke data-[state=on]:border-accent touch:min-h-44 flex items-center gap-6 rounded-full border px-12 py-8 outline-hidden duration-150 ease-out focus-visible:-translate-y-4"
                        >
                            <Icon size={20} aria-hidden />
                            <T keyName={labelKey} />
                        </ToggleGroup.Item>
                    ))}
                </ToggleGroup.Root>
            </SettingRow>
        </SettingsPanel>
    );
}
