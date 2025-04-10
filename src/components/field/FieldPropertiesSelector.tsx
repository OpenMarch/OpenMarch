import { useFieldProperties } from "@/context/fieldPropertiesContext";
import FieldProperties from "@/global/classes/FieldProperties";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { useCallback, useEffect, useRef, useState } from "react";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTriggerButton,
} from "../ui/Select";
import { Button } from "../ui/Button";
import { DangerNote } from "../ui/Note";
import { useTranslation } from "react-i18next";

export default function FieldPropertiesSelector() {
    const { t } = useTranslation();
    const { fieldProperties, setFieldProperties } = useFieldProperties()!;
    const [currentTemplate, setCurrentTemplate] = useState<
        FieldProperties | undefined
    >(fieldProperties);
    const selectRef = useRef<HTMLButtonElement>(null);

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
        return (
            <div>{t("field.fieldPropertiesSelector.noFieldProperties")}</div>
        );

    return (
        <div className="flex w-full min-w-0 flex-col gap-16">
            <div className="flex w-full min-w-0 flex-col gap-16">
                <div className="flex w-full items-center justify-between gap-16 px-12">
                    <p className="text-body">
                        {t("field.fieldPropertiesSelector.templateLabel")}
                    </p>
                    <div className="flex gap-8">
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
                                    t(
                                        "field.fieldPropertiesSelector.fieldTypeLabel",
                                    )
                                }
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
                                    {fieldProperties.isCustom && (
                                        <SelectItem
                                            key={"custom"}
                                            value={"Custom"}
                                        >
                                            {t(
                                                "field.fieldPropertiesSelector.customField",
                                            )}
                                        </SelectItem>
                                    )}
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <Button
                    className={`h-[2.5rem] items-center ${currentTemplate?.name === fieldProperties?.name ? "hidden" : ""}`}
                    onClick={applyChanges}
                >
                    {t("field.fieldPropertiesSelector.applyFieldType")}
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
                    {t("field.fieldPropertiesSelector.differentSizeWarning")}
                </DangerNote>
            </div>
        </div>
    );
}
