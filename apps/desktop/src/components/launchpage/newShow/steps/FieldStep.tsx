import { useEffect, useRef, useState } from "react";
import { FieldProperties } from "@openmarch/core";
import FieldPropertiesSelector from "@/components/field/FieldPropertiesSelector";
import FieldPreview from "@/components/field/FieldPreview";
import type { NewShowEnsembleData, NewShowFieldData } from "../../newShowTypes";
import { getDefaultFieldTemplate } from "./getDefaultFieldTemplate";
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
    const environment = ensemble?.environment ?? "outdoor";
    const ensembleType = ensemble?.ensemble_type;
    const defaultTemplate = getDefaultFieldTemplate(environment, ensembleType);

    const [currentTemplate, setCurrentTemplate] = useState<FieldProperties>(
        field?.template ?? defaultTemplate,
    );
    const prevEnvironment = useRef(environment);
    const prevEnsembleType = useRef(ensembleType);
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

        if (
            prevEnvironment.current === environment &&
            prevEnsembleType.current === ensembleType
        )
            return;
        prevEnvironment.current = environment;
        prevEnsembleType.current = ensembleType;
        setCurrentTemplate(defaultTemplate);
        onChange({
            template: defaultTemplate,
            isCustom: defaultTemplate.isCustom ?? false,
        });
    }, [environment, ensembleType, field, defaultTemplate, onChange]);

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
                environment={environment}
                ensembleType={ensembleType}
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
