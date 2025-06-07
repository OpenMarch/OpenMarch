import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import FieldPropertiesSelector from "./FieldPropertiesSelector";
import FieldPropertiesCustomizer from "./FieldPropertiesCustomizer";
import { Switch, Button } from "@openmarch/ui";
import { useFieldProperties } from "@/context/fieldPropertiesContext";
import FieldIoButtons from "./FieldIoButtons";
import FieldProperties from "@/global/classes/FieldProperties";
import { StaticFormField } from "../ui/FormField";

export default function FieldPropertiesSettings() {
    const { fieldProperties, setFieldProperties } = useFieldProperties()!;
    const { uiSettings, setUiSettings } = useUiSettingsStore();

    if (!fieldProperties)
        return (
            <div>
                No field properties to load! This should never happen, please
                reach out to support
            </div>
        );

    return (
        <div className="flex flex-col">
            <div className="flex w-full min-w-0 flex-col gap-16">
                <h4 className="text-h5 leading-none">General</h4>
                <div className="flex flex-col gap-16">
                    <StaticFormField label="Grid lines">
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
                    </StaticFormField>
                    <StaticFormField label="Half lines">
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
                    </StaticFormField>
                    <div className="m-8">
                        <FieldIoButtons />
                    </div>
                </div>

                <div className="flex w-full min-w-0 flex-col gap-16">
                    <h4 className="text-h5 leading-none">Customization</h4>
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
                            Customize
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
