import { FieldProperties } from "@openmarch/core";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { useCallback, useEffect, useRef, useState } from "react";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTriggerButton,
    Button,
    DangerNote,
    SelectLabel,
    SelectSeparator,
} from "@openmarch/ui";
import { StaticFormField } from "../ui/FormField";
import { T, useTolgee } from "@tolgee/react";
import {
    fieldPropertiesQueryOptions,
    updateFieldPropertiesMutationOptions,
} from "@/hooks/queries";
import FootballTemplates from "@/global/classes/fieldTemplates/Football";
import GridFieldTemplates from "@/global/classes/fieldTemplates/GridFields";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useDatabaseReady } from "@/hooks/useDatabaseReady";

interface FieldPropertiesSelectorProps {
    onTemplateChange?: (template: FieldProperties) => void;
    currentTemplate?: FieldProperties;
}

export default function FieldPropertiesSelector({
    onTemplateChange,
    currentTemplate: externalCurrentTemplate,
}: FieldPropertiesSelectorProps = {}) {
    const queryClient = useQueryClient();
    const databaseReady = useDatabaseReady();
    const isControlled = Boolean(onTemplateChange);

    const { data: fieldProperties, isLoading } = useQuery(
        fieldPropertiesQueryOptions(databaseReady && !externalCurrentTemplate),
    );
    const { mutate: setFieldProperties } = useMutation(
        updateFieldPropertiesMutationOptions(queryClient),
    );
    const [internalCurrentTemplate, setInternalCurrentTemplate] = useState<
        FieldProperties | undefined
    >(fieldProperties);
    const selectRef = useRef<HTMLButtonElement>(null);
    const { t } = useTolgee();

    const currentTemplate = externalCurrentTemplate || internalCurrentTemplate;

    const handleFieldTypeChange = useCallback(
        (value: string) => {
            const template = Object.values(FieldPropertiesTemplates).find(
                (fieldPropertiesTemplate) =>
                    fieldPropertiesTemplate.name === value,
            );
            if (!template) {
                console.error("Template not found", value);
                return;
            }

            if (onTemplateChange) {
                onTemplateChange(template);
            } else {
                setInternalCurrentTemplate(template);
            }
        },
        [onTemplateChange],
    );

    const applyChanges = useCallback(() => {
        if (currentTemplate) setFieldProperties(currentTemplate);
    }, [currentTemplate, setFieldProperties]);

    useEffect(() => {
        if (!externalCurrentTemplate && fieldProperties) {
            setInternalCurrentTemplate(fieldProperties);
        }
    }, [fieldProperties, externalCurrentTemplate]);

    if (!externalCurrentTemplate && !fieldProperties && !isLoading) {
        return <div>{t("fieldProperties.errors.notDefined")}</div>;
    }

    if (isLoading && !externalCurrentTemplate) {
        return <div>Loading...</div>;
    }

    const selectValue = currentTemplate?.isCustom
        ? "Custom"
        : currentTemplate?.name || fieldProperties?.name || "";

    return (
        <div className="flex w-full min-w-0 flex-col gap-16">
            <div className="flex w-full min-w-0 flex-col gap-16">
                <StaticFormField
                    label={t("fieldProperties.fieldTemplate.label")}
                >
                    <Select
                        onValueChange={handleFieldTypeChange}
                        {...(isControlled
                            ? { value: selectValue }
                            : {
                                  defaultValue: fieldProperties?.isCustom
                                      ? "Custom"
                                      : fieldProperties?.name,
                              })}
                        ref={selectRef}
                    >
                        <SelectTriggerButton
                            label={
                                currentTemplate?.name ||
                                fieldProperties?.name ||
                                t("fieldProperties.fieldType.label")
                            }
                        />
                        <SelectContent>
                            <SelectGroup>
                                <SelectLabel>Football</SelectLabel>
                                {Object.values(FootballTemplates).map(
                                    (template) => (
                                        <SelectItem
                                            key={template.name}
                                            value={template.name}
                                        >
                                            {template.name}
                                        </SelectItem>
                                    ),
                                )}
                                <SelectSeparator />
                                <SelectLabel>Grid</SelectLabel>
                                {Object.values(GridFieldTemplates).map(
                                    (template) => (
                                        <SelectItem
                                            key={template.name}
                                            value={template.name}
                                        >
                                            {template.name}
                                        </SelectItem>
                                    ),
                                )}
                                <SelectSeparator />
                                <SelectLabel>Custom</SelectLabel>
                                {(currentTemplate?.isCustom ||
                                    fieldProperties?.isCustom) && (
                                    <SelectItem key="custom" value="Custom">
                                        {t("fieldProperties.customFieldName")}
                                    </SelectItem>
                                )}
                            </SelectGroup>
                        </SelectContent>
                    </Select>
                </StaticFormField>
                {!isControlled && (
                    <Button
                        className={`h-[2.5rem] items-center ${currentTemplate?.name === fieldProperties?.name ? "hidden" : ""}`}
                        onClick={applyChanges}
                    >
                        <T keyName="fieldProperties.applyFieldType" />
                    </Button>
                )}
            </div>
            {!isControlled && (
                <div
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
                    <DangerNote>
                        <T keyName="fieldProperties.applyFieldTypeWarning" />
                    </DangerNote>
                </div>
            )}
        </div>
    );
}
