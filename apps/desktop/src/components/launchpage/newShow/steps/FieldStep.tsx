import { useEffect, useRef, useState } from "react";
import { FieldProperties } from "@openmarch/core";
import FieldPropertiesSelector from "@/components/field/FieldPropertiesSelector";
import FieldPreview from "@/components/field/FieldPreview";
import type { NewShowEnsembleData, NewShowFieldData } from "../../newShowTypes";
import { getDefaultFieldTemplate } from "@/global/classes/Activities";
import { T } from "@tolgee/react";

interface FieldStepProps {
    ensemble: NewShowEnsembleData | null;
    field: NewShowFieldData | null;
    onChange: (field: NewShowFieldData) => void;
}

export default function FieldStep({
    ensemble,
    field,
    onChange,
}: FieldStepProps) {
    const activity = ensemble?.activity;
    const defaultTemplate = getDefaultFieldTemplate(activity);

    const [currentTemplate, setCurrentTemplate] = useState<FieldProperties>(
        field?.template ?? defaultTemplate,
    );
    const prevActivity = useRef(activity);
    const hasInitializedField = useRef(field !== null);

    useEffect(() => {
        if (!hasInitializedField.current && !field) {
            hasInitializedField.current = true;
            onChange({
                template: defaultTemplate,
                isCustom: defaultTemplate.isCustom ?? false,
            });
            return;
        }

        if (prevActivity.current === activity) return;
        prevActivity.current = activity;
        setCurrentTemplate(defaultTemplate);
        onChange({
            template: defaultTemplate,
            isCustom: defaultTemplate.isCustom ?? false,
        });
    }, [activity, field, defaultTemplate, onChange]);

    const handleTemplateChange = (template: FieldProperties) => {
        setCurrentTemplate(template);
        onChange({
            template,
            isCustom: template.isCustom ?? false,
        });
    };

    return (
        <div className="mx-auto flex w-full max-w-lg flex-col gap-16">
            <FieldPropertiesSelector
                currentTemplate={currentTemplate}
                onTemplateChange={handleTemplateChange}
            />
            <div className="flex flex-col gap-8">
                <span className="text-body text-text font-medium">
                    <T keyName="launchpage.files.fieldPreview" />
                </span>
                <FieldPreview
                    fieldProperties={currentTemplate}
                    className="h-[200px]"
                    disableBackground
                />
            </div>
        </div>
    );
}
