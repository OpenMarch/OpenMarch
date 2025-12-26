import { FieldProperties } from "@openmarch/core";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { useCallback, useEffect, useRef, useState } from "react";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTriggerButton,
    DangerNote,
    SelectLabel,
    SelectSeparator,
} from "@openmarch/ui";
import { StaticFormField, WizardFormField } from "../ui/FormField";
import { T, useTolgee } from "@tolgee/react";
import {
    fieldPropertiesQueryOptions,
    updateFieldPropertiesMutationOptions,
} from "@/hooks/queries";
import FootballTemplates from "@/global/classes/fieldTemplates/Football";
import IndoorTemplates from "@/global/classes/fieldTemplates/Indoor";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface FieldPropertiesSelectorProps {
    environment?: "indoor" | "outdoor";
    onTemplateChange?: (template: FieldProperties) => void;
    currentTemplate?: FieldProperties;
}

export default function FieldPropertiesSelector({
    environment,
    onTemplateChange,
    currentTemplate: externalCurrentTemplate,
}: FieldPropertiesSelectorProps) {
    const queryClient = useQueryClient();

    // Check if database is ready - disable query if not (wizard mode)
    const [databaseReady, setDatabaseReady] = useState(true);
    useEffect(() => {
        const checkDb = async () => {
            const ready = await window.electron.databaseIsReady();
            setDatabaseReady(ready);
        };
        void checkDb();
    }, []);

    // Only query field properties if database is ready and no external template provided
    const { data: fieldProperties } = useQuery({
        ...fieldPropertiesQueryOptions(),
        enabled: databaseReady && !externalCurrentTemplate,
    });

    const { mutate: setFieldProperties } = useMutation(
        updateFieldPropertiesMutationOptions(queryClient),
    );
    const [internalCurrentTemplate, setInternalCurrentTemplate] = useState<
        FieldProperties | undefined
    >(fieldProperties);
    const selectRef = useRef<HTMLButtonElement>(null);
    const { t } = useTolgee();

    // Use external template if provided, otherwise use internal state
    const currentTemplate = externalCurrentTemplate || internalCurrentTemplate;

    const handleFieldTypeChange = useCallback(
        (value: string) => {
            const template = Object.values(FieldPropertiesTemplates).find(
                (FieldPropertiesTemplate) =>
                    FieldPropertiesTemplate.name === value,
            );
            if (!template) {
                console.error("Template not found", value);
                return;
            }

            // If onTemplateChange callback is provided (wizard mode), use it instead of mutating DB
            if (onTemplateChange) {
                onTemplateChange(template);
            } else {
                // Normal mode: update database
                setInternalCurrentTemplate(template);
                setFieldProperties(template);
            }
        },
        [setFieldProperties, onTemplateChange],
    );

    useEffect(() => {
        if (!externalCurrentTemplate && fieldProperties) {
            setInternalCurrentTemplate(fieldProperties);
        }
    }, [fieldProperties, externalCurrentTemplate]);

    // If we have an external template (wizard mode), we don't need fieldProperties
    // If we don't have external template, we need fieldProperties
    if (!externalCurrentTemplate && !fieldProperties) {
        return <div>{t("fieldProperties.errors.notDefined")}</div>;
    }

    const FormField = onTemplateChange ? WizardFormField : StaticFormField;

    return (
        <div className="flex w-full min-w-0 flex-col gap-16">
            <FormField
                label={t("fieldProperties.fieldTemplate.label")}
                {...(onTemplateChange && {
                    helperText: t("fieldProperties.fieldTemplate.helper"),
                })}
            >
                <Select
                    onValueChange={handleFieldTypeChange}
                    value={
                        currentTemplate?.isCustom
                            ? "Custom"
                            : currentTemplate?.name ||
                              fieldProperties?.name ||
                              ""
                    }
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
                            {(environment === undefined ||
                                environment === "outdoor") && (
                                <>
                                    <SelectLabel>Football</SelectLabel>
                                    {Object.values(FootballTemplates).map(
                                        (template, index) => (
                                            <SelectItem
                                                key={index}
                                                value={template.name}
                                            >
                                                {template.name}
                                            </SelectItem>
                                        ),
                                    )}
                                    <SelectSeparator />
                                </>
                            )}
                            {(environment === undefined ||
                                environment === "indoor") && (
                                <>
                                    <SelectLabel>Indoor</SelectLabel>
                                    {Object.values(IndoorTemplates).map(
                                        (template, index) => (
                                            <SelectItem
                                                key={index}
                                                value={template.name}
                                            >
                                                {template.name}
                                            </SelectItem>
                                        ),
                                    )}
                                    <SelectSeparator />
                                </>
                            )}
                            <SelectLabel>Custom</SelectLabel>
                            {fieldProperties?.isCustom && (
                                <SelectItem key={"custom"} value={"Custom"}>
                                    {t("fieldProperties.customFieldName")}
                                </SelectItem>
                            )}
                        </SelectGroup>
                    </SelectContent>
                </Select>
            </FormField>
            {!onTemplateChange && (
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
