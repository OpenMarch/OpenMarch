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
                <div className="flex w-full items-center justify-between gap-16">
                    <p className="text-body">Type</p>
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
                    </div>
                </div>
                <Button
                    className={`h-[2.5rem] items-center ${currentTemplate?.name === fieldProperties?.name ? "hidden" : ""}`}
                    onClick={applyChanges}
                >
                    Apply Field Type
                </Button>
            </div>
            <div
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
                    Marchers will not move to the new field type size, they will
                    stay where they are on the canvas. You can always change
                    back the field type.
                </DangerNote>
            </div>
        </div>
    );
}
