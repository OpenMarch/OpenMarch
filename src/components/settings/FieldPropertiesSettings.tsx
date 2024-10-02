import { useFieldProperties } from "@/context/fieldPropertiesContext";
import FieldProperties from "@/global/classes/FieldProperties";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { ChangeEvent, useCallback, useEffect, useState } from "react";

export default function FieldPropertiesSettings() {
    const { fieldProperties, setFieldProperties } = useFieldProperties()!;
    const [currentTemplate, setCurrentTemplate] = useState<
        FieldProperties | undefined
    >(fieldProperties);
    const { uiSettings, setUiSettings } = useUiSettingsStore();

    const handleFieldTypeChange = useCallback(
        (event: ChangeEvent<HTMLSelectElement>) => {
            const template = Object.values(FieldPropertiesTemplates).find(
                (FieldPropertiesTemplate) =>
                    FieldPropertiesTemplate.name === event.target.value
            );
            if (!template)
                console.error("Template not found", event.target.value);

            setCurrentTemplate(template);
        },
        []
    );

    const applyChanges = useCallback(() => {
        if (currentTemplate) setFieldProperties(currentTemplate);
    }, [currentTemplate, setFieldProperties]);

    useEffect(() => {
        setCurrentTemplate(fieldProperties);
    }, [fieldProperties]);

    return (
        <div>
            <h3 className="text-2xl">Field Properties</h3>
            <div className="grid grid-cols-2 gap-4">
                <div className="flex gap-2">
                    <div>Show grid lines</div>
                    <input
                        type="checkbox"
                        checked={uiSettings.gridLines}
                        onChange={() =>
                            setUiSettings({
                                ...uiSettings,
                                gridLines: !uiSettings.gridLines,
                            })
                        }
                    />
                </div>
                <div className="flex gap-2">
                    <div>Show half lines</div>
                    <input
                        type="checkbox"
                        checked={uiSettings.halfLines}
                        onChange={() =>
                            setUiSettings({
                                ...uiSettings,
                                halfLines: !uiSettings.halfLines,
                            })
                        }
                    />
                </div>
                <div>Field type</div>
                <select
                    className="p-1 rounded"
                    onChange={handleFieldTypeChange}
                    defaultValue={fieldProperties?.name}
                >
                    {Object.entries(FieldPropertiesTemplates).map(
                        (template, index) => (
                            <option key={index}>{template[1].name}</option>
                        )
                    )}
                </select>
                <div
                    className="col-span-2 text-sm text-red-500"
                    hidden={
                        fieldProperties?.name === currentTemplate?.name ||
                        (fieldProperties?.width === currentTemplate?.width &&
                            fieldProperties?.height ===
                                currentTemplate?.height &&
                            fieldProperties?.centerFrontPoint.xPixels ===
                                currentTemplate?.centerFrontPoint.xPixels &&
                            fieldProperties?.centerFrontPoint.yPixels ===
                                currentTemplate?.centerFrontPoint.yPixels)
                    }
                >
                    <strong className="text-md">Warning</strong> - changing to
                    this field type of a different size will lead to different
                    marcher coordinates on the new field type. Coordinates on
                    your original field type will be unaffected if you switch
                    back before making any changes. We will try to fix this in a
                    future update.
                </div>
                <button
                    className="btn-primary col-span-2"
                    onClick={applyChanges}
                    disabled={currentTemplate?.name === fieldProperties?.name}
                >
                    Apply Field Type
                </button>
            </div>
        </div>
    );
}
