import { useSettingsStore } from "@/stores/UiSettingsStore";
import FieldPropertiesSelector from "./FieldPropertiesSelector";
import FieldPropertiesCustomizer from "./FieldPropertiesCustomizer";
import { Switch } from "../ui/Switch";
import { useFieldProperties } from "@/context/fieldPropertiesContext";
import FieldIoButtons from "./FieldIoButtons";
import { Button } from "../ui/Button";
import FieldProperties from "@/global/classes/FieldProperties";

export default function FieldPropertiesSettings() {
    const { fieldProperties, setFieldProperties } = useFieldProperties()!;
    const {
        showGridLines,
        showHalfLines,
        setSetting: set,
    } = useSettingsStore();

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
                <div className="flex flex-col gap-16 px-12">
                    <div className="flex w-full items-center justify-between gap-16">
                        <label htmlFor="gridLines" className="text-body">
                            Grid lines
                        </label>
                        <Switch
                            id="gridLines"
                            checked={showGridLines}
                            onCheckedChange={() =>
                                set("showGridLines", !showGridLines)
                            }
                        />
                    </div>
                    <div className="flex w-full items-center justify-between gap-16">
                        <label htmlFor="halfLines" className="text-body">
                            Half lines
                        </label>
                        <Switch
                            id="halfLines"
                            checked={showHalfLines}
                            onCheckedChange={() =>
                                set("showHalfLines", !showHalfLines)
                            }
                        />
                    </div>
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
