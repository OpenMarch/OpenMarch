import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useState } from "react";
import { Checkbox } from "../ui/Checkbox";
import FieldPropertiesSelector from "./FieldPropertiesSelector";
import FieldPropertiesCustomizer from "./FieldPropertiesCustomizer";

export default function FieldPropertiesSettings() {
    const [useCustomField, setUseCustomField] = useState(false);
    const { uiSettings, setUiSettings } = useUiSettingsStore();

    return (
        <div className="flex flex-col">
            <div className="flex w-full min-w-0 flex-col gap-16">
                <h4 className="text-h5 leading-none">General</h4>
                <div className="flex flex-col gap-16 px-12">
                    <div className="flex w-full items-center justify-between gap-16">
                        <label htmlFor="gridLines" className="text-body">
                            Grid lines
                        </label>
                        <Checkbox
                            id="gridLines"
                            checked={uiSettings.gridLines}
                            onCheckedChange={() =>
                                setUiSettings({
                                    ...uiSettings,
                                    gridLines: !uiSettings.gridLines,
                                })
                            }
                        />
                    </div>
                    <div className="flex w-full items-center justify-between gap-16">
                        <label htmlFor="halfLines" className="text-body">
                            Half lines
                        </label>
                        <Checkbox
                            id="halfLines"
                            checked={uiSettings.halfLines}
                            onCheckedChange={() =>
                                setUiSettings({
                                    ...uiSettings,
                                    halfLines: !uiSettings.halfLines,
                                })
                            }
                        />
                    </div>
                </div>

                <div className="flex w-full min-w-0 flex-col gap-16">
                    <h4 className="text-h5 leading-none">Customization</h4>
                    {/* TODO, make this a toggle group. Look like this - https://www.subframe.com/library/components/toggle-group or https://www.radix-ui.com/primitives/docs/components/toggle-group */}
                    TODO - Get rid of this checkbox and make a toggle group
                    instead
                    {/* This is in text so I don't forget */}
                    <div className="flex w-full items-center justify-between gap-16">
                        <label htmlFor="gridLines" className="text-h6">
                            Use custom field
                        </label>
                        <Checkbox
                            id="customField"
                            checked={useCustomField}
                            onCheckedChange={(e) => {
                                setUseCustomField(e as boolean);
                            }}
                        />
                    </div>
                    {useCustomField ? (
                        <FieldPropertiesCustomizer />
                    ) : (
                        <FieldPropertiesSelector />
                    )}
                </div>
            </div>
        </div>
    );
}
