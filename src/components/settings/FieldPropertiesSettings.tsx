import { useFieldProperties } from "@/context/fieldPropertiesContext";
import FieldProperties from "@/global/classes/FieldProperties";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { ChangeEvent, useCallback, useEffect, useState } from "react";

export default function FieldPropertiesSettings() {
    const { fieldProperties, setFieldProperties } = useFieldProperties()!;
    const [currentTemplate, setCurrentTemplate] = useState<
        FieldProperties | undefined
    >(fieldProperties);

    const handleChange = useCallback(
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
            <h3 className="text-4xl">Field Properties</h3>
            <div className="grid grid-cols-2 gap-4">
                <div>Field Type</div>
                <select
                    className="p-1 rounded"
                    onChange={handleChange}
                    defaultValue={fieldProperties?.name}
                >
                    {Object.entries(FieldPropertiesTemplates).map(
                        (template, index) => (
                            <option key={index}>{template[1].name}</option>
                        )
                    )}
                </select>
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
