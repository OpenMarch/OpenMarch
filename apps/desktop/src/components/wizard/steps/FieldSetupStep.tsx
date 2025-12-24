import { useState, useEffect } from "react";
import FieldPropertiesSelector from "@/components/field/FieldPropertiesSelector";
import FieldPropertiesCustomizer from "@/components/field/FieldPropertiesCustomizer";
import { useGuidedSetupStore } from "@/stores/GuidedSetupStore";
import { useQuery } from "@tanstack/react-query";
import { fieldPropertiesQueryOptions } from "@/hooks/queries";
import { FieldProperties } from "@openmarch/core";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";

export default function FieldSetupStep() {
    const { wizardState, updateField } = useGuidedSetupStore();
    const { data: fieldProperties } = useQuery(fieldPropertiesQueryOptions());
    const [currentTemplate, setCurrentTemplate] = useState<
        FieldProperties | undefined
    >(fieldProperties);

    // Initialize with default template if not set
    useEffect(() => {
        if (!wizardState?.field && fieldProperties) {
            // Default to College Football Field (no end zones)
            const defaultTemplate =
                FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;
            setCurrentTemplate(defaultTemplate);
            updateField({
                template: defaultTemplate,
                isCustom: false,
            });
        } else if (wizardState?.field) {
            setCurrentTemplate(wizardState.field.template);
        }
    }, [wizardState, fieldProperties, updateField]);

    // Update wizard state when field properties change from database
    useEffect(() => {
        if (fieldProperties) {
            updateField({
                template: fieldProperties,
                isCustom: fieldProperties.isCustom || false,
            });
        }
    }, [fieldProperties, updateField]);

    if (!fieldProperties) {
        return <div>Loading field properties...</div>;
    }

    const environment = wizardState?.ensemble?.environment || "outdoor";

    const handleTemplateChange = (template: FieldProperties) => {
        setCurrentTemplate(template);
        updateField({
            template,
            isCustom: false,
        });
    };

    return (
        <div className="flex flex-col gap-16">
            <FieldPropertiesSelector
                environment={environment}
                onTemplateChange={handleTemplateChange}
                currentTemplate={currentTemplate}
            />
            {currentTemplate?.isCustom && (
                <div className="mt-8">
                    <FieldPropertiesCustomizer />
                </div>
            )}
        </div>
    );
}
