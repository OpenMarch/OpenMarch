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
} from "@openmarch/ui";
import { StaticFormField } from "../ui/FormField";
import { T, useTolgee } from "@tolgee/react";
import { useFieldProperties, useUpdateFieldProperties } from "@/hooks/queries";

export default function FieldPropertiesSelector() {
    const { data: fieldProperties } = useFieldProperties();
    const { mutate: setFieldProperties } = useUpdateFieldProperties();
    const [currentTemplate, setCurrentTemplate] = useState<
        FieldProperties | undefined
    >(fieldProperties);
    const selectRef = useRef<HTMLButtonElement>(null);
    const { t } = useTolgee();

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

    if (!fieldProperties)
        return <div>{t("fieldProperties.errors.notDefined")}</div>;

    return (
        <div className="flex w-full min-w-0 flex-col gap-16">
            <div className="flex w-full min-w-0 flex-col gap-16">
                <StaticFormField
                    label={t("fieldProperties.fieldTemplate.label")}
                >
                    <Select
                        onValueChange={handleFieldTypeChange}
                        defaultValue={
                            fieldProperties.isCustom
                                ? "Custom"
                                : fieldProperties.name
                        }
                        ref={selectRef}
                    >
                        <SelectTriggerButton
                            label={
                                fieldProperties.name ||
                                t("fieldProperties.fieldType.label")
                            }
                        />
                        <SelectContent>
                            <SelectGroup>
                                {Object.entries(FieldPropertiesTemplates).map(
                                    (template, index) => (
                                        <SelectItem
                                            key={index}
                                            value={template[1].name}
                                        >
                                            {template[1].name}
                                        </SelectItem>
                                    ),
                                )}
                                {fieldProperties.isCustom && (
                                    <SelectItem key={"custom"} value={"Custom"}>
                                        {t("fieldProperties.customFieldName")}
                                    </SelectItem>
                                )}
                            </SelectGroup>
                        </SelectContent>
                    </Select>
                </StaticFormField>
                <Button
                    className={`h-[2.5rem] items-center ${currentTemplate?.name === fieldProperties?.name ? "hidden" : ""}`}
                    onClick={applyChanges}
                >
                    <T keyName="fieldProperties.applyFieldType" />
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
                    <T keyName="fieldProperties.applyFieldTypeWarning" />
                </DangerNote>
            </div>
        </div>
    );
}
