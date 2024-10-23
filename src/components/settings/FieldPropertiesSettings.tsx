import { useFieldProperties } from "@/context/fieldPropertiesContext";
import FieldProperties from "@/global/classes/FieldProperties";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useCallback, useEffect, useState } from "react";
import { Checkbox } from "../ui/Checkbox";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTriggerButton,
} from "../ui/Select";
import { Button } from "../ui/Button";
import { DangerNote } from "../ui/Note";

export default function FieldPropertiesSettings() {
    const { fieldProperties, setFieldProperties } = useFieldProperties()!;
    const [currentTemplate, setCurrentTemplate] = useState<
        FieldProperties | undefined
    >(fieldProperties);
    const { uiSettings, setUiSettings } = useUiSettingsStore();

    const handleFieldTypeChange = useCallback((value: string) => {
        const template = Object.values(FieldPropertiesTemplates).find(
            (FieldPropertiesTemplate) => FieldPropertiesTemplate.name === value,
        );
        if (!template) console.error("Template not found", value);

        setCurrentTemplate(template);
    }, []);

    const applyChanges = useCallback(() => {
        if (currentTemplate) setFieldProperties(currentTemplate);
    }, [currentTemplate, setFieldProperties]);

    useEffect(() => {
        setCurrentTemplate(fieldProperties);
    }, [fieldProperties]);

    return (
        <div className="flex flex-col gap-16">
            <h5 className="col-span-full h-fit text-h5">Field Properties</h5>
            <div className="grid grid-cols-2 gap-x-0 gap-y-16">
                <div className="flex w-full items-center gap-12">
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
                    <label htmlFor="gridLines" className="text-body">
                        Show grid lines
                    </label>
                </div>
                <div className="flex w-full items-center gap-12">
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
                    <label htmlFor="halfLines" className="text-body">
                        Show half lines
                    </label>
                </div>
                <div className="col-span-full flex items-center justify-between gap-16">
                    <p className="text-body">Field type</p>
                    <div className="flex gap-8">
                        <Select
                            onValueChange={handleFieldTypeChange}
                            defaultValue={fieldProperties?.name}
                        >
                            <SelectTriggerButton
                                label={fieldProperties?.name || "Field type"}
                            />
                            <SelectContent>
                                <SelectGroup>
                                    {Object.entries(
                                        FieldPropertiesTemplates,
                                    ).map((template, index) => (
                                        <SelectItem
                                            key={index}
                                            value={template[1].name}
                                        >
                                            {template[1].name}
                                        </SelectItem>
                                    ))}
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                        <Button
                            className="h-[2.5rem] items-center"
                            onClick={applyChanges}
                            disabled={
                                currentTemplate?.name === fieldProperties?.name
                            }
                        >
                            Apply Field Type
                        </Button>
                    </div>
                </div>
            </div>
            <div
                className="col-span-full"
                hidden={
                    fieldProperties?.name === currentTemplate?.name ||
                    (fieldProperties?.width === currentTemplate?.width &&
                        fieldProperties?.height === currentTemplate?.height &&
                        fieldProperties?.centerFrontPoint.xPixels ===
                            currentTemplate?.centerFrontPoint.xPixels &&
                        fieldProperties?.centerFrontPoint.yPixels ===
                            currentTemplate?.centerFrontPoint.yPixels)
                }
            >
                <DangerNote>
                    Changing to this field type of a different size will lead to
                    different marcher coordinates on the new field type.
                    Coordinates on your original field type will be unaffected
                    if you switch back before making any changes.
                </DangerNote>
            </div>
        </div>
    );
}
