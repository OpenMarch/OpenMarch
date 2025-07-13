import FieldPropertiesSelector from "./FieldPropertiesSelector";
import FieldPropertiesCustomizer from "./FieldPropertiesCustomizer";
import { useFieldProperties } from "@/context/fieldPropertiesContext";
import FieldIoButtons from "./FieldIoButtons";
import FieldProperties from "@/global/classes/FieldProperties";
import { Button } from "@openmarch/ui";
import { T } from "@tolgee/react";

export default function FieldPropertiesSettings() {
    const { fieldProperties, setFieldProperties } = useFieldProperties()!;

    if (!fieldProperties)
        return (
            <div>
                <T keyName="fieldProperties.errors.noPropertiesToLoad" />
            </div>
        );

    return (
        <div className="flex h-full flex-col overflow-y-auto pb-16">
            <div className="flex w-full min-w-0 flex-col gap-16">
                <h4 className="text-h5 leading-none">
                    <T keyName="fieldProperties.general" />
                </h4>
                <div className="flex flex-col gap-16">
                    <div className="m-8">
                        <FieldIoButtons />
                    </div>
                </div>

                <div className="flex w-full min-w-0 flex-col gap-16">
                    <h4 className="text-h5 leading-none">
                        <T keyName="fieldProperties.customization" />
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
                            className="w-fit self-end"
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
