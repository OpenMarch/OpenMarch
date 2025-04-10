import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import FieldPropertiesSelector from "./FieldPropertiesSelector";
import FieldPropertiesCustomizer from "./FieldPropertiesCustomizer";
import { Switch } from "../ui/Switch";
import { useFieldProperties } from "@/context/fieldPropertiesContext";
import FieldIoButtons from "./FieldIoButtons";
import { Button } from "../ui/Button";
import FieldProperties from "@/global/classes/FieldProperties";
import { useTranslation } from "react-i18next";

export default function FieldPropertiesSettings() {
    const { fieldProperties, setFieldProperties } = useFieldProperties()!;
    const { uiSettings, setUiSettings } = useUiSettingsStore();
    const { t } = useTranslation();

    if (!fieldProperties)
        return (
            <div>{t("field.fieldPropertiesSettings.noFieldProperties")}</div>
        );

    return (
        <div className="flex flex-col">
            <div className="flex w-full min-w-0 flex-col gap-16">
                <h4 className="text-h5 leading-none">
                    {t("field.fieldPropertiesSettings.generalLabel")}
                </h4>
                <div className="flex flex-col gap-16 px-12">
                    <div className="flex w-full items-center justify-between gap-16">
                        <label htmlFor="gridLines" className="text-body">
                            {t("field.fieldPropertiesSettings.gridLinesLabel")}
                        </label>
                        <Switch
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
                            {t("field.fieldPropertiesSettings.halfLinesLabel")}
                        </label>
                        <Switch
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
                    <div className="m-8">
                        <FieldIoButtons />
                    </div>
                </div>

                <div className="flex w-full min-w-0 flex-col gap-16">
                    <h4 className="text-h5 leading-none">
                        {t("field.fieldPropertiesSettings.customizationLabel")}
                    </h4>
                    <FieldPropertiesSelector />
                    {fieldProperties?.isCustom ? (
                        <FieldPropertiesCustomizer />
                    ) : (
                        <Button
                            onClick={() => {
                                setFieldProperties(
                                    new FieldProperties({
                                        ...fieldProperties,
                                        isCustom: true,
                                    }),
                                );
                            }}
                            size="compact"
                            className="w-[50%] self-end"
                            variant="secondary"
                        >
                            {t("field.fieldPropertiesSettings.customize")}
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
